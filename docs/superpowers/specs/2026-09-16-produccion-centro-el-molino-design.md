# Centro El Molino — Diseño de la versión de producción

- **Fecha:** 2026-09-16
- **Estado:** aprobado en sesión de diseño, pendiente de revisión final del spec
- **Punto de partida:** prototipo `centro El Molino.html` (front-end único con `localStorage`) y `README.md`

Este documento define cómo pasar el prototipo a una aplicación en producción con servidor, base de datos, login real, tiempo real, notificaciones push e instalación en el celular. Donde este documento contradice al README, **manda este documento** (ver §12).

---

## 1. Decisiones principales

| Tema | Decisión |
|---|---|
| Lenguaje | TypeScript en todo el proyecto |
| App | Next.js (App Router) desplegado en Vercel |
| Backend de datos | Supabase: Postgres, Auth, Realtime, `pg_cron`, `pg_net` |
| Alcance v1 | Las 4 secciones del prototipo + PWA instalable + notificaciones push + mensajes en tiempo real + registro de moderación |
| Semana | Selección **por comida** (desayuno, almuerzo, cena), no por día |
| Valor por defecto | Si la persona no cambia nada, aplica su **Plan semanal** |
| Hora límite | **Una por comida**, configurable por el Director (hora + mismo día o día anterior) |
| Ventana editable | Semana **actual y siguiente**, mientras la comida no haya cerrado |
| Zona horaria | `America/El_Salvador` (UTC-6, sin horario de verano), definida una vez en SQL y una vez en TS, con prueba que verifica que coinciden |
| Calendario | **Solo el Director** crea, edita y elimina eventos; los demás solo ven |
| Recuperar contraseña | La cambia el Director (contraseña temporal); **la app no envía correos** |
| Eliminar cuenta | Se reemplaza por **desactivar / reactivar** |
| Editar mensajes | No se permite; solo publicar, reaccionar, responder y borrar |
| Entornos | Un solo proyecto Supabase (ya creado) que es **producción**, sin staging. Se desarrolla desde cada computadora contra ese proyecto; sin Docker en las computadoras. Despliegue de `master` |

---

## 2. Arquitectura

**Piezas:**

- **Next.js + TypeScript en Vercel.** Server Components para leer, Server Actions para modificar. Despliegue de `master` desde GitHub Actions (§10).
- **Supabase:**
  - Postgres con Row Level Security (RLS) como barrera real de permisos.
  - Auth (correo y contraseña) con sesión en cookies vía `@supabase/ssr`.
  - Realtime (Postgres Changes) para Mensajes.
  - `pg_cron` para tareas cada 5 minutos y `pg_net` para llamar rutas de la app.

**Flujo de datos:**

- **Lecturas:** Server Components con el cliente Supabase de servidor usando la sesión del usuario; RLS filtra según el rol.
- **Escrituras con la sesión del usuario (RLS aplica):** Server Actions que validan la entrada con `zod`. Las selecciones de comida se guardan llamando a funciones SQL `guardar_seleccion` y `volver_a_plan` (§6.4).
- **Escrituras con el cliente admin** (llave secreta de Supabase, que **solo existe en el servidor**). La Server Action primero verifica `auth.uid()` y las reglas que correspondan:
  - *Solo Director activo:* crear cuenta, poner contraseña a otra cuenta, cambiar rol de otra cuenta, desactivar/reactivar.
  - *La propia cuenta:* editar nombre, siglas y correo; cambiar preferencias `avisar_*`; limpiar `debe_cambiar_contrasena`. (Cambiar la **propia** contraseña no usa el cliente admin: tras verificar la actual se hace `updateUser` con la sesión del usuario, para no cerrar la sesión abierta.)
  - *Usuario con sesión, vía `/api/push`:* registrar y borrar suscripciones de su dispositivo reasignando el `endpoint` (§8.2); se verifica la sesión antes de usar el cliente admin.
  - *Servidor sin usuario (cron y envíos):* leer destinatarios y `suscripciones_push` para enviar notificaciones; borrar suscripciones caducadas.
- **Esquema:** migraciones SQL versionadas en `supabase/migrations/`. Nadie cambia tablas a mano en el proyecto de Supabase.
- **Tipos:** generados desde la base con `supabase gen types` y guardados en el repo.

**Estructura del repo:**

```
app/
  login/                    inicio de sesión
  cambiar-contrasena/       cambio obligatorio tras contraseña temporal
  (app)/                    layout con navegación; exige sesión activa
    comidas/plan/
    comidas/semana/
    mensajes/
    calendario/
    configuraciones/
  api/cron/recordatorios/   llamado por pg_cron
  api/push/                 alta/baja de suscripciones push
components/                 UI compartida (portada del diseño del prototipo)
lib/
  supabase/                 clientes: navegador, servidor, admin
  fechas/                   zona horaria y semana lunes–domingo
  comidas/                  lógica pura: horas límite, ventana, valor efectivo
  push/                     envío Web Push y selección de destinatarios
  validacion/               esquemas zod
supabase/
  migrations/
  seed.sql                  usuarios de prueba para la base temporal de CI
  config.toml
scripts/
  crear-director.ts         crea el primer Director
  datos-demo.ts             cuentas y datos de desarrollo (@demo.test) en el proyecto
  limpiar-datos-demo.ts     borra todo lo creado por datos-demo (checklist de lanzamiento)
public/manifest.webmanifest, public/sw.js, íconos
docs/prototipo/             el HTML del prototipo, como referencia visual
tests/                      unit/, integration/, e2e/
```

**Diseño visual:** se conserva el del prototipo (Source Serif 4 + IBM Plex Sans, paleta, tarjetas, colores por estado de comida), portado a componentes.

---

## 3. Modelo de datos

### 3.1 Tipos enumerados

- `rol`: `director`, `residente`, `administracion`
- `tiempo_comida`: `desayuno`, `almuerzo`, `cena`
- `estado_comida`: `si`, `no`, `temprano`, `tarde`, `bolsa`, `enfermo`
- `origen_seleccion`: `persona`, `plan`

### 3.2 Tablas

**`perfiles`** — una fila por cuenta, mismo `id` que `auth.users`.
`id uuid PK → auth.users`, `nombre text`, `siglas text`, `correo text unique`, `rol rol`, `activo bool default true`, `debe_cambiar_contrasena bool default false`, `avisar_hora_limite bool default true`, `avisar_mensajes bool default true`, `creado_en timestamptz`.

**`plan_semanal`** — patrón habitual.
`usuario_id → perfiles`, `dia_semana smallint (1=lunes … 7=domingo)`, `comida tiempo_comida`, `estado estado_comida`, `nota text null`. PK `(usuario_id, dia_semana, comida)`. Si no hay fila, esa comida está "Sin definir" en el plan.

**`selecciones_comida`** — excepciones y valores congelados.
`usuario_id → perfiles`, `fecha date`, `comida tiempo_comida`, `estado estado_comida`, `nota text null`, `origen origen_seleccion`, `actualizado_en timestamptz`. PK `(usuario_id, fecha, comida)`.

**`horas_limite`** — 3 filas, una por comida.
`comida tiempo_comida PK`, `dia_relativo smallint check in (0, -1)`, `hora time`.
Valores iniciales: desayuno `-1, 21:00`; almuerzo `0, 10:00`; cena `0, 16:00`.

**`comidas_cerradas`** — cierre definitivo.
`fecha date`, `comida tiempo_comida`, `cerrada_en timestamptz`. PK `(fecha, comida)`.

**`mensajes`**
`id uuid PK`, `autor_id → perfiles`, `padre_id → mensajes null on delete cascade`, `texto text check (length between 1 and 2000)`, `creado_en timestamptz`.
`padre_id` nulo = publicación; no nulo = respuesta. Solo un nivel: el padre de una respuesta debe ser una publicación (check vía trigger).

**`reacciones`**
`mensaje_id → mensajes on delete cascade`, `usuario_id → perfiles`, `creado_en`. PK `(mensaje_id, usuario_id)`. Solo sobre publicaciones (trigger).

**`registro_moderacion`**
`id uuid PK`, `moderador_id → perfiles`, `autor_id → perfiles`, `texto_eliminado text`, `era_respuesta bool`, `eliminado_en timestamptz`.

**`eventos`**
`id uuid PK`, `titulo text`, `fecha date`, `hora time null`, `creado_por → perfiles`, `creado_en`, `actualizado_en`.

**`suscripciones_push`**
`id uuid PK`, `usuario_id → perfiles on delete cascade`, `endpoint text unique`, `p256dh text`, `auth text`, `creado_en`.

**`avisos_enviados`**
`fecha date`, `comida tiempo_comida`, `enviado_en timestamptz`. PK `(fecha, comida)`.

### 3.3 Reglas de integridad

- `nota` obligatoria (no vacía) cuando `estado` es `temprano`, `tarde` o `enfermo`, en `plan_semanal` y `selecciones_comida`. Para `temprano` y `tarde` la nota es una hora `HH:MM` (validada en la app; la UI usa selector de hora). Para los demás estados `nota` se guarda nula.
- Solo usuarios con rol `director` o `residente` pueden crear o modificar filas en `plan_semanal` y `selecciones_comida`. Si alguien pasa a `administracion`, sus filas se conservan pero dejan de mostrarse (las vistas listan solo Directores/Residentes activos); si vuelve a un rol con comidas, reaparecen.
- Siempre debe existir **al menos un Director activo**: un trigger sobre `perfiles` toma `pg_advisory_xact_lock` y rechaza cualquier cambio de `rol` o `activo` que deje cero Directores activos. El bloqueo evita que dos Directores se degraden mutuamente al mismo tiempo.
- La zona horaria vive en la función SQL `zona_horaria_app()` (devuelve `'America/El_Salvador'`) y en la constante `ZONA_HORARIA` de `lib/fechas/`; una prueba de integración verifica que coinciden.

---

## 4. Login y cuentas

- **Supabase Auth con correo y contraseña.** Registro público desactivado, confirmación de correo desactivada. La app no envía correos.
- **Crear cuenta (Director):** el servidor crea el usuario en Auth (ya confirmado) y su fila en `perfiles`. Si falla la creación del perfil, borra el usuario de Auth.
- **Primer Director de cada entorno:** `npm run crear-director` (usa la llave secreta; se ejecuta una vez).
- **Proxy de Next.js (`proxy.ts`):** refresca la sesión y redirige a `/login` si no hay sesión. **Layout y páginas de la app** (`exigirPerfil`): redirigen a `/login` si el perfil está inactivo y a `/cambiar-contrasena` si `debe_cambiar_contrasena`. La página `/login` solo redirige hacia la app si el perfil está activo; así una cuenta desactivada con cookies vigentes no entra en un bucle de redirecciones.
- **Desactivar (Director):** primero `activo = false` en `perfiles` (el trigger de §3.3 puede rechazarlo); después bloqueo (`ban`) del usuario en Supabase Auth, lo que invalida la renovación de sesión en dispositivos ya abiertos. Si el `ban` falla, se revierte `activo`. Reactivar revierte ambas cosas en el mismo orden. Un usuario desactivado no aparece en vistas de comidas, no recibe avisos y no puede iniciar sesión; sus mensajes se conservan.
- **Contraseñas:**
  - Mínimo 8 caracteres.
  - Cambio propio en Configuraciones: pide la contraseña actual y la verifica con `signInWithPassword` usando un cliente Supabase **sin persistencia de sesión** (no toca las cookies de la sesión abierta) antes de actualizar.
  - El Director puede poner una contraseña a otra cuenta; queda `debe_cambiar_contrasena = true` y en el siguiente ingreso la persona debe elegir una nueva.
- **Perfil propio:** cada usuario edita **su propio** nombre, siglas y correo, como en el README. El Director **no** edita nombre, siglas ni correo de otras cuentas; sobre otras cuentas solo cambia rol, contraseña y estado activo.
- **Cambiar correo:** por el servidor con el cliente admin, sin confirmación por correo; se valida formato y unicidad, y se actualiza también `perfiles.correo`. El nuevo correo es el que se usa para iniciar sesión.
- **Roles:** solo el Director cambia roles, nunca el propio. Nadie puede desactivarse a sí mismo.
- **Rutas públicas del proxy** (no redirigen a `/login`): `/login`, `/api/cron/*` (se protege con `CRON_SECRET`), `/sw.js`, `/manifest.webmanifest`, íconos y la página "Sin conexión".

---

## 5. Permisos

### 5.1 Matriz por rol

| Función | Director | Residente | Administración |
|---|---|---|---|
| Ver/editar su propio Plan semanal | ✅ | ✅ | — |
| Ver Plan semanal de todos (solo lectura) | ❌ | ❌ | ✅ |
| Cambiar su selección en Semana (actual y siguiente, comida abierta) | ✅ | ✅ | — |
| Ver Semana de todos con resumen (solo lectura) | ❌ | ❌ | ✅ |
| Definir horas límite | ✅ | ❌ | ❌ |
| Publicar / reaccionar / responder mensajes | ✅ | ✅ | ✅ |
| Borrar mensajes propios | ✅ | ✅ | ✅ |
| Borrar mensajes de cualquiera (queda en registro) | ✅ | ❌ | ❌ |
| Ver registro de moderación | ✅ | ❌ | ❌ |
| Ver calendario | ✅ | ✅ | ✅ |
| Crear / editar / eliminar eventos | ✅ | ❌ | ❌ |
| Editar su propio perfil y contraseña | ✅ | ✅ | ✅ |
| Cambiar su propio rol o desactivarse | ❌ | ❌ | ❌ |
| Crear cuentas, cambiar roles, poner contraseñas, desactivar/reactivar | ✅ | ❌ | ❌ |

### 5.2 Row Level Security

Funciones auxiliares `security definer`: `mi_rol()` y `soy_activo()` leen el perfil de `auth.uid()`. Todas las políticas exigen usuario autenticado y activo.

| Tabla | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `perfiles` | Cualquier usuario activo ve **todas** las filas, incluidas las inactivas (para mostrar autores de mensajes antiguos y listar cuentas a reactivar). Las vistas de comidas y los destinatarios push filtran `activo = true` explícitamente | Sin políticas: solo el servidor con cliente admin |
| `plan_semanal` | Propio; `administracion` ve todo | Propio, si rol es `director` o `residente` |
| `selecciones_comida` | Propio; `administracion` ve todo | Propio, si rol es `director`/`residente` **y** `comida_editable(fecha, comida, now())`. Las escrituras de la app pasan por `guardar_seleccion` / `volver_a_plan` (§6.4) |
| `horas_limite` | Todos | UPDATE solo `director` |
| `comidas_cerradas` | Todos | Nadie (solo tareas programadas) |
| `mensajes` | Todos | INSERT con `autor_id = auth.uid()`; DELETE si es autor o `director` |
| `reacciones` | Todos | INSERT/DELETE con `usuario_id = auth.uid()` |
| `registro_moderacion` | Solo `director` | Nadie (solo trigger) |
| `eventos` | Todos | Solo `director` |
| `suscripciones_push` | Propias | Propias |
| `avisos_enviados` | Nadie | Nadie (solo servidor con cliente admin) |

### 5.3 Garantías en la base de datos

- **Moderación:** trigger `AFTER DELETE` en `mensajes`: si `auth.uid()` no es el autor, inserta en `registro_moderacion` con copia del texto. Los borrados en cascada de respuestas por borrar su publicación no generan filas adicionales.
- **Horas límite:** `comida_editable` se evalúa en cada escritura; la hora del dispositivo no importa.
- **Director activo mínimo:** ver §3.3.

---

## 6. Comidas

### 6.1 Cálculo de cierre y apertura

- **Cierre** de la comida `C` en la fecha `F` = fecha `F + dia_relativo(C)` a la `hora(C)`, en `America/El_Salvador`.
- **Semana:** de lunes a domingo, calculada en `America/El_Salvador`.
- **`comida_editable(fecha, comida, ahora)`** es verdadero si y solo si se cumplen las tres condiciones:
  1. `fecha` está entre el lunes de la semana actual y el domingo de la semana siguiente, ambos incluidos.
  2. `ahora` es anterior al cierre calculado con las horas límite vigentes.
  3. No existe fila en `comidas_cerradas` para `(fecha, comida)`.
- **Cierre definitivo:** una vez cerrada, una comida no se reabre aunque el Director mueva la hora límite. Un cambio de hora límite solo afecta a comidas todavía abiertas; si la nueva hora ya pasó, la comida queda bloqueada de inmediato (condición 2) y se cierra en la siguiente corrida de la tarea.

### 6.2 Valor efectivo

Para una persona, fecha y comida:

1. Fila en `selecciones_comida` si existe.
2. Si no, y la comida **no** está en `comidas_cerradas`, fila de `plan_semanal` del día de la semana correspondiente.
3. Si no, **"Sin definir"**.

Una comida cerrada sin fila queda "Sin definir" para siempre, aunque la persona cree su plan después; así el historial no cambia. Por eso `valorEfectivo` recibe si la comida está cerrada.

### 6.3 Congelado al cerrar

`cerrar_comidas_vencidas()` es un `PROCEDURE` que recorre cada `(fecha, comida)` vencida y no cerrada, con `fecha` desde hace 7 días hasta el domingo de la semana siguiente. Por cada una, y con `COMMIT` al final de cada iteración:

- inserta en `selecciones_comida` una fila con `origen = plan` para cada Director/Residente activo que no tenga fila y sí tenga plan para ese día y comida, con `ON CONFLICT DO NOTHING` (por si alguien guardó justo al cierre);
- inserta la fila en `comidas_cerradas`.

**Restricciones para que `COMMIT` funcione dentro del procedimiento:**
- el job de `pg_cron` (cada 5 min) ejecuta **solo** `CALL public.cerrar_comidas_vencidas()`, sin otras sentencias en el mismo comando;
- el procedimiento **no** es `SECURITY DEFINER` ni tiene cláusula `SET` (tampoco `SET search_path`); usa nombres con esquema (`public.…`);
- la prueba de integración hace el `CALL` fuera de cualquier transacción.

Si la tarea falla un tiempo, la edición igual queda bloqueada por hora y Administración ve el valor efectivo calculado desde el plan. Si falla más de 7 días, las comidas de esa brecha quedan sin cerrar y siguen mostrando el plan; se acepta como caso límite.

### 6.4 Guardar una selección

En RLS, un `UPDATE` o `DELETE` sobre filas no permitidas afecta 0 filas **sin dar error**, y un `INSERT` rechazado da un error genérico (42501). Para poder decir por qué se rechazó, las escrituras de la app pasan por dos funciones SQL `security invoker` (RLS sigue aplicando):

- **`guardar_seleccion(fecha, comida, estado, nota)`**
  1. Verifica rol y `comida_editable(fecha, comida, now())`; si la comida no está abierta, lanza un error con código propio (`MOL01`, comida cerrada o fuera de ventana).
  2. Valida la nota según el estado.
  3. Si estado y nota son iguales al plan, borra la excepción; si no, hace upsert con `origen = persona`.
- **`volver_a_plan(fecha, comida)`:** mismas verificaciones; borra la fila con `origen = persona`.

La Server Action traduce `MOL01` a un mensaje específico ("El almuerzo ya cerró a las 10:00") y refresca la vista.

### 6.5 Vistas

**Plan semanal (Director, Residente):**
- Cuadrícula 7 días × 3 comidas; en celular, lista por día.
- Se edita en cualquier momento.

**Semana (Director, Residente):**
- Navegación: semanas pasadas (solo lectura), actual y siguiente.
- Cada día muestra sus 3 comidas con las 6 opciones.
- Cada comida indica "según tu plan" / "cambiada" y "cierra hoy 10:00" / "cerrada".

**Semana (Administración):**
- Selector de día.
- Resumen por comida con conteos por estado; las notas de hora se incluyen en el conteo, por ejemplo "1 tarde (13:30)".
- Tabla de personas × 3 comidas con notas; resalta excepciones (`origen = persona`); "Sin definir" visible.
- Navega semanas pasadas, actual y siguiente.
- Se refresca al volver la app a primer plano.

**Plan semanal (Administración):** tabla comparativa de solo lectura.

### 6.6 Dónde vive la lógica

- **`lib/comidas/`**, funciones puras que recibe `ahora` y las horas límite como parámetros:
  - `cierreDe(fecha, comida, horasLimite)`
  - `enVentanaEditable(fecha, ahora)`
  - `estaAbierta(fecha, comida, ahora, horasLimite, cerradas)`
  - `valorEfectivo(seleccion, plan, cerrada)`
  - `resumenComida(valores)`
- **Postgres:** `comida_editable(fecha, comida, ahora)` es la que bloquea escrituras.
- **Paridad:** una tabla de casos compartida (JSON en `tests/fixtures/`) se ejecuta contra ambas implementaciones (ver §9).

---

## 7. Mensajes

- **Feed:** publicaciones ordenadas de más nueva a más antigua; respuestas agrupadas bajo cada publicación en orden cronológico.
- **Carga:** las 50 publicaciones más recientes y botón "Ver anteriores".
- **Acciones:** publicar, responder, reaccionar (solo publicaciones) y borrar (propio; Director cualquiera, con confirmación).
- **Registro de moderación:** apartado visible solo para el Director, dentro de Mensajes.
- **Tiempo real:**
  - Una migración agrega `mensajes` y `reacciones` a la publicación `supabase_realtime`.
  - Suscripción a Postgres Changes de ambas tablas mientras la página está abierta.
  - INSERT: se agrega el elemento. El evento no trae nombre ni siglas del autor, así que la página carga los perfiles al entrar y los usa como caché; si llega un autor desconocido, recarga perfiles.
  - DELETE: el evento trae solo la clave primaria; se quita el mensaje por `id` y la reacción por `(mensaje_id, usuario_id)`.
  - Si se pierde la conexión: indicador "Reconectando…"; al reconectar, se recarga la lista completa.
- **Reacciones:** actualización optimista con reversión si el servidor rechaza.

---

## 8. PWA, notificaciones push y tareas programadas

### 8.1 PWA

- **`manifest.webmanifest`:** nombre "Centro El Molino", `display: standalone`, colores de la marca e íconos (monograma provisional).
- **`public/sw.js`** propio:
  - recibe `push` y muestra la notificación;
  - en `notificationclick` abre o enfoca la URL de la sección;
  - sirve una página "Sin conexión" si no hay red.
- **Sin caché de datos offline.**

### 8.2 Web Push

- **Estándar:** Web Push con llaves VAPID; envío desde el servidor con `web-push`.
- **Activación por dispositivo:** en Configuraciones → "Notificaciones en este dispositivo". Pide permiso con un gesto del usuario, envía la suscripción a `/api/push` y permite darla de baja.
- **Dispositivos compartidos:** `/api/push` guarda la suscripción con el cliente admin haciendo upsert por `endpoint` y asignándola al usuario actual (si el endpoint era de otra persona, pasa a ser de quien inició sesión). Al cerrar sesión, la app borra la suscripción de ese dispositivo antes de salir.
- **iPhone:** si detecta iOS sin la app instalada, muestra instrucciones para "Agregar a pantalla de inicio" (requiere iOS 16.4+).
- **Preferencias:** interruptores `avisar_hora_limite` y `avisar_mensajes` en el perfil.
- **Destinatarios** (usuarios activos con la preferencia correspondiente):

| Evento | Destinatarios | Abre |
|---|---|---|
| Nueva publicación | Todos menos el autor | `/mensajes` |
| Nueva respuesta | Autor de la publicación y quienes ya respondieron en el hilo, menos quien responde | `/mensajes` |
| Recordatorio de hora límite | Directores/Residentes cuya comida esté **"Sin definir"** (sin selección ni plan) | `/comidas/semana` |

- **Envío:** las notificaciones de mensajes se envían tras responder al usuario (`after()` de Next.js).
- **Suscripciones caducadas:** si el servicio push responde 404 o 410, se borra la suscripción.

### 8.3 Tareas programadas (`pg_cron`, cada 5 minutos)

1. **`CALL public.cerrar_comidas_vencidas()`**: procedimiento SQL ejecutado directamente en Postgres (§6.3).
2. **Recordatorios:** `pg_net` hace POST a `<URL de la app>/api/cron/recordatorios` con cabecera `Authorization: Bearer <CRON_SECRET>` y `timeout_milliseconds` de 10000. La URL y el secreto se guardan en Supabase Vault, nunca en migraciones. La URL es el dominio de producción de Vercel (`<proyecto>.vercel.app` o dominio propio), no la de un despliegue puntual. La ruta:
   - rechaza sin secreto válido;
   - busca `(fecha, comida)` cuyo cierre ocurre dentro de los próximos 60 minutos y no están en `avisos_enviados`;
   - inserta primero en `avisos_enviados` (si la inserción choca, otra corrida ya lo tomó);
   - responde `202` de inmediato y envía los avisos con `after()`.

---

## 9. Errores y pruebas

### 9.1 Manejo de errores

- **Resultado de las Server Actions:** tipo `{ ok: true, data } | { ok: false, error: string, campos?: Record<string, string> }`, con mensajes en español.
- **Presentación:** errores generales como aviso emergente; errores de validación junto al campo.
- **Pantallas de error:** `error.tsx` por sección con "Reintentar"; `not-found.tsx` global.
- **Registro:** errores del cron y del envío push se registran con `console.error` (visibles en los logs de Vercel). Sin servicios de monitoreo externos en v1.

### 9.2 Pruebas

- **Unitarias (Vitest):**
  - `lib/comidas` con la tabla de casos: domingo en la noche, desayuno con cierre el día anterior al cruzar semana, límites exactos de la hora, cambio de hora límite con comidas ya cerradas, ventana actual + siguiente.
  - Esquemas `zod`.
  - Selección de destinatarios push.
- **Dónde corren:** en las computadoras de desarrollo solo corren las unitarias (no hay Docker). Integración y punta a punta corren en GitHub Actions, que levanta una base temporal con `supabase start`. Como la única base remota es producción, el setup de esas pruebas **aborta si `NEXT_PUBLIC_SUPABASE_URL` no apunta a `127.0.0.1` o `localhost`**; así nunca pueden correr contra la base real.
- **Integración (Vitest + Supabase temporal en CI):**
  - Iniciar sesión como cada rol del seed y verificar operaciones permitidas y prohibidas contra la base real (RLS).
  - `comida_editable` ejecutada con la misma tabla de casos que las unitarias (recibe `ahora` como parámetro).
  - `guardar_seleccion` / `volver_a_plan`, incluido el error `MOL01`.
  - Trigger de moderación, regla de Director activo mínimo, `cerrar_comidas_vencidas` y coincidencia de `zona_horaria_app()` con `ZONA_HORARIA`.
  - **Independencia del reloj:** RLS y `pg_cron` usan la hora real. Las pruebas que escriben selecciones preparan sus propias horas límite y usan comidas que siempre están abiertas (por ejemplo, el almuerzo del miércoles de la semana siguiente con cierre el mismo día); los casos de cierre se prueban llamando a las funciones con `ahora` explícito.
- **Punta a punta (Playwright):**
  - Login por rol y cambio obligatorio de contraseña temporal.
  - Residente cambia una comida y Administración lo ve en Semana.
  - Director borra un mensaje ajeno y aparece en el registro.
  - Residente no ve controles para crear eventos.
- **CI (GitHub Actions) en cada PR a `master`:** typecheck, lint, unitarias; `supabase start` + migraciones desde cero + integración; build + Playwright.

---

## 10. Entornos y despliegue

| Entorno | Rama | Supabase | Vercel |
|---|---|---|---|
| Desarrollo | cualquiera | el proyecto único (producción), vía `.env.local` | `next dev` en cada computadora |
| CI | PR a `master` | base temporal `supabase start` dentro de GitHub Actions | build de verificación, sin desplegar |
| Producción | `master` | el proyecto único | Production |

**No hay staging** (decisión del equipo). Consecuencias y reglas que la compensan:

- **Antes del lanzamiento** no hay usuarios reales, así que desarrollar contra el proyecto es seguro. Los datos de desarrollo se crean con `scripts/datos-demo.ts`, con cuentas de correo `@demo.test`, y se borran con `scripts/limpiar-datos-demo.ts` como paso obligatorio del checklist de lanzamiento (§11).
- **Después del lanzamiento:**
  - toda migración pasa primero por CI contra una base temporal;
  - las pruebas de notificaciones se hacen solo con cuentas propias;
  - las pruebas de integración y punta a punta nunca corren contra el proyecto (§9.2).
- **Migraciones: un único camino.**
  - Después de la Fase 0, las migraciones solo se aplican desde la GitHub Action de despliegue al hacer merge a `master`. Nadie ejecuta `supabase db push` desde su computadora.
  - **Excepción única:** durante la Fase 0, antes de que exista la Action, las migraciones de la base común se aplican con la CLI desde la computadora de quien implementa la fase (`supabase link` + `supabase db push`).
- **Esquema primero:** como no hay base local, una funcionalidad que necesita tablas nuevas se divide en dos PRs:
  1. **PR de esquema:** migración y pruebas de integración, que corren en CI. Al hacer merge se aplica al proyecto.
  2. **PR de funcionalidad:** empieza regenerando los tipos (`npm run db:tipos`, que lee el esquema del proyecto) y construye las pantallas contra la base ya actualizada.
- **Orden de despliegue:** migraciones primero, código después. Vercel no despliega por Git (`vercel.json`: `"git": { "deploymentEnabled": false }`). Al hacer push a `master`, la GitHub Action ejecuta en orden:
  1. `supabase link --project-ref $SUPABASE_PROJECT_REF`;
  2. `supabase config push --yes` (ajustes de Auth desde `config.toml`). `enable_signup = false` debe quedar explícito en `[auth]` y en `[auth.email]`, porque la plantilla de `supabase init` trae `true`;
  3. `supabase db push`;
  4. `vercel pull --yes --environment=production` → `vercel build --prod` → `vercel deploy --prebuilt --prod`, con el token del dueño.
- **Errores de build y despliegue:** quedan en el log de la GitHub Action, visible para ambos colaboradores.
- **Compatibilidad:** durante el despliegue, la app anterior corre unos minutos contra el esquema nuevo, así que las migraciones deben ser compatibles hacia atrás (agregar antes de quitar; quitar columnas o funciones en un despliegue posterior).
- **Datos:** no se migran datos del prototipo.
- **Variables de entorno:**
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (acepta la *anon key* clásica o una *publishable key*)
  - `SUPABASE_SECRET_KEY` (acepta la *service_role key* clásica o una *secret key*)
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT`
  - `CRON_SECRET`

  En desarrollo van en `.env.local`, que cada colaborador llena en su computadora; en producción, en Vercel. `.env.example` documenta los nombres sin valores.
- **Repositorio público (requisito):** ningún secreto en commits; `.env*.local` en `.gitignore`. El repo **debe seguir siendo público**: en Vercel Hobby, con un repo privado se bloquean los despliegues de commits cuyo autor es un colaborador, incluso desde la CLI con el token del dueño. Al terminar la Fase 0 se verifica desplegando un commit hecho por un colaborador; si aun así se bloquea, la vía soportada es el plan Pro.
- **Plan Free de Supabase:** un proyecto sin actividad durante 7 días se pausa. Antes del lanzamiento puede pasar y se reactiva desde el panel; con uso diario del centro no ocurre.

---

## 11. Trabajo en paralelo

- **Ramas:** `master` (producción), protegida. Trabajo en ramas `feat/...` desde `master`; PR con revisión del otro colaborador y CI en verde.
- **Planes de implementación:** un documento por fase o pista en `docs/superpowers/plans/`, todos escritos antes de empezar.
- **Fase 0, base común (un solo PR):**
  - proyecto Next.js, clientes Supabase, `.gitattributes` (finales de línea LF), `.env.example` y `vercel.json`;
  - migración inicial: todos los enums, `perfiles`, `horas_limite` con valores iniciales, `mi_rol()`, `soy_activo()`, `zona_horaria_app()` y el trigger de Director activo mínimo;
  - `lib/fechas/` (zona horaria, semana lunes–domingo) y `lib/comidas/` con `cierreDe`, `enVentanaEditable`, `estaAbierta` y `valorEfectivo`, con sus pruebas;
  - login, cambio de contraseña obligatorio, proxy con rutas públicas y layout con navegación por rol;
  - CI, workflow de despliegue, scripts `crear-director`, `datos-demo` y `limpiar-datos-demo`;
  - mover el prototipo a `docs/prototipo/`.
- **Después, en paralelo:**

| Pista | Contenido | Depende de |
|---|---|---|
| Comidas | tablas de comidas, `comida_editable`, `guardar_seleccion`, `volver_a_plan`, `cerrar_comidas_vencidas`, vistas de Plan y Semana | Fase 0 |
| Mensajes | tablas, trigger de moderación, realtime, feed y registro | Fase 0 |
| Calendario | tabla `eventos` y vistas | Fase 0 |
| Configuraciones | perfil propio, gestión de usuarios, pantalla de horas límite (edita `horas_limite`, creada en Fase 0) | Fase 0 |
| PWA y push | manifest, service worker, suscripciones, preferencias, recordatorios y avisos de mensajes | Fase 0 para PWA y suscripciones; Comidas para recordatorios; Mensajes para avisos de mensajes |

- **Migraciones:**
  - siempre con `supabase migration new <nombre>`, que no requiere Docker;
  - rebase sobre `master` antes del merge, para que el orden de timestamps sea correcto;
  - aplicación solo por la Action (§10).
- **README:** se actualiza al cerrar la Fase 0 con las reglas de este documento.
- **Checklist de lanzamiento** (último paso, antes de dar acceso al centro):
  1. ejecutar `limpiar-datos-demo`;
  2. verificar que "Allow new users to sign up" está desactivado;
  3. crear el primer Director real con `crear-director`;
  4. verificar notificaciones con una cuenta propia en Android e iPhone;
  5. confirmar que el plan Hobby de Vercel aplica al centro.

---

## 12. Cambios respecto al README original

1. Semana registra la situación **por comida**, no por día, y parte del Plan semanal.
2. La hora límite única se reemplaza por **una hora límite por comida** (mismo día o día anterior).
3. "Solo la semana en curso" pasa a **semana actual y siguiente**.
4. **Solo el Director** crea, edita y elimina eventos (antes: Director y Residente creaban).
5. "Eliminar cuentas" pasa a **desactivar/reactivar**.
6. Nota obligatoria para `temprano`, `tarde` y `enfermo`.
7. Nuevo: resumen con conteos para Administración, registro de moderación visible para el Director, contraseña temporal obligatoria, notificaciones push, PWA.

---

## 13. Fuera de alcance v1

- Recuperación de contraseña por correo y cualquier envío de correos.
- Edición de mensajes; reacciones en respuestas; hilos de más de un nivel.
- Tiempo real fuera de Mensajes.
- Uso sin conexión con datos en caché.
- Gestión del menú de comidas dentro del sistema.
- Servicios de monitoreo externos.

---

## Anexo A. Configuración de cuentas

El repo es del dueño (`jose-mario-sandoval`). Ningún secreto se comparte por chat ni se commitea: cada uno se pega directamente en el servicio que lo usa.

### A.1 Supabase (proyecto ya creado)

1. **Propiedad:** si el proyecto está en una cuenta personal de un colaborador, antes del lanzamiento se transfiere a una organización del centro o del dueño (*Project Settings → General → Transfer project*), para que no dependa de una sola persona.
2. **Miembros:** los dos colaboradores deben tener acceso a la organización del proyecto (rol *Developer* basta para desarrollar).
3. **Contraseña de base de datos:** guardarla en un gestor de contraseñas. Si nadie la tiene, se restablece en *Project Settings → Database*.
4. **Token para CI:** generar un *Personal Access Token* (*Account → Access Tokens*).
5. **Verificación:** después del primer despliegue, confirmar en *Authentication → Sign In / Providers* que "Allow new users to sign up" está desactivado.

Los ajustes de Auth (`supabase config push`), las extensiones y el esquema (`supabase db push`) los aplica la GitHub Action desde el repo. La única excepción son las migraciones de la Fase 0 (§10).

### A.2 GitHub (dueño del repo)

1. **Proteger `master`** (*Settings → Rules → Rulesets*):
   - exigir PR con 1 aprobación;
   - exigir que pase el check de CI;
   - bloquear force push y borrado.
2. **Secretos** (*Settings → Secrets and variables → Actions → Secrets*):
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_DB_PASSWORD`
   - `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (ver A.3)
3. **Variable** (*Actions → Variables*, no es secreta): `SUPABASE_PROJECT_REF`, el identificador del proyecto que aparece en su URL.

### A.3 Vercel (dueño del repo, cuando la Fase 0 esté lista)

1. **Proyecto:**
   - crear la cuenta con el login de GitHub del dueño (plan Hobby);
   - crear el proyecto importando el repo (`vercel.json` desactiva los despliegues por Git);
   - *Production Branch* = `master`.
2. **Variables de entorno de Production (§10):**
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY`, las mismas del proyecto;
   - llaves VAPID generadas con `npx web-push generate-vapid-keys`;
   - `VAPID_SUBJECT` con un `mailto:` de contacto;
   - `CRON_SECRET` generado con `openssl rand -hex 32`.
3. **Token para CI:** crear un token en *Account Settings → Tokens* y guardarlo como `VERCEL_TOKEN` en GitHub, junto con `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID` (aparecen en `.vercel/project.json` tras `vercel link`, o en Settings del proyecto).
4. **Vault de Supabase:** guardar la URL de producción de la app y el `CRON_SECRET` con el snippet SQL provisto en el repo.
5. **Desarrollo local de notificaciones:** los colaboradores generan sus propias llaves VAPID y `CRON_SECRET` para `.env.local`. Con eso prueban push en `localhost` desde la computadora; los celulares se prueban contra producción con cuentas propias.

**Limitaciones del plan Hobby:**
- Es para uso no comercial; confirmar que aplica al centro, o pasar a Pro (20 USD/mes).
- Solo el dueño accede al panel de Vercel (variables y logs de ejecución). Los colaboradores ven el resultado de cada despliegue en el log de la GitHub Action.
