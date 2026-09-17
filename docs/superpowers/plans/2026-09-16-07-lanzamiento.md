# Lanzamiento — checklist

> **Para agentes:** SUB-SKILL REQUERIDO: usar superpowers:executing-plans para recorrer este checklist. Varias tareas se hacen en paneles web (Vercel, Supabase, GitHub) con la cuenta de una persona: el agente prepara y verifica, **no** ingresa credenciales.

**Objetivo:** pasar de "todo mergeado en `master`" a "el centro usa la app":
- desplegar en Vercel importando el repo y cargando las variables;
- cerrar la configuración de Supabase;
- verificar notificaciones;
- limpiar los datos demo y crear las cuentas reales.

**Estado de partida (2026-09-17):**
- **Código:** Fase 0, Comidas, Calendario, Configuraciones, Mensajes y PWA/push, todos mergeados en `master` con CI en verde.
- **Migraciones aplicadas al proyecto `ekjoyicwscxlixwzwrle`** con `npm run db:aplicar`: `base`, `comidas`, `calendario`, `mensajes` y `push`. No hay que ejecutar SQL de esquema.
- **Datos demo cargados:** 5 cuentas `@demo.test`, planes, eventos y mensajes. Contraseña: `CONTRASENA_DEMO` en `.env.local`.
- **Variables para Vercel preparadas en `.env.vercel.local`** (local, ignorado por git): llaves VAPID y `CRON_SECRET`.

**Referencias:** spec §8, §10, §11; índice [`2026-09-16-00-indice.md`](2026-09-16-00-indice.md) §5.

---

### Tarea 1: Importar el repo en Vercel

- [ ] **Paso 1: Elegir quién importa**
  - **Opción A (recomendada): el dueño del repo (`jose-mario-sandoval`) importa desde su cuenta de Vercel.** Vercel instala su GitHub App en esa cuenta y cada push a `master` despliega solo.
  - **Opción B: importa un colaborador desde su cuenta de Vercel.** El dueño tiene que autorizar la GitHub App de Vercel sobre el repo (GitHub → Settings → Applications → Vercel → Repository access). Sin esa autorización el repo no aparece en la lista de Vercel.
  - **Opción C: sin GitHub App.** Desde la computadora del colaborador: `npx vercel login`, `npx vercel link`, cargar las variables (paso 3) y `npx vercel --prod`. Funciona, pero no despliega automáticamente con cada push.

- [ ] **Paso 2: Crear el proyecto**

  *Add New → Project* → `Sistema_Centro_El_Molino` → framework **Next.js**, directorio raíz `./`, build y output por defecto. `vercel.json` fija la región `pdx1`, junto a la base en us-west-2.

- [ ] **Paso 3: Variables de entorno (Production y Preview)**

  | Variable | Valor |
  |---|---|
  | `NEXT_PUBLIC_SUPABASE_URL` | `https://ekjoyicwscxlixwzwrle.supabase.co` |
  | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la de `.env.local` (anon) |
  | `SUPABASE_SECRET_KEY` | la de `.env.local` (service_role) |
  | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | la de `.env.vercel.local` |
  | `VAPID_PRIVATE_KEY` | la de `.env.vercel.local` |
  | `VAPID_SUBJECT` | `mailto:` con un correo de contacto real del centro (reemplazar el de ejemplo) |
  | `CRON_SECRET` | la de `.env.vercel.local` |

  **No** cargar `SUPABASE_DB_PASSWORD`, `SUPABASE_POOLER_HOST` ni `CONTRASENA_DEMO`: son solo para la computadora de desarrollo.

- [ ] **Paso 4: Desplegar y anotar la URL de producción**

  Esperado: el build termina en verde y la URL `https://<proyecto>.vercel.app/login` muestra "Centro El Molino".

- [ ] **Paso 5: Desactivar la protección de despliegues**

  *Settings → Deployment Protection → Vercel Authentication: Disabled*. Sin esto, los celulares piden una cuenta de Vercel y `pg_cron` no puede llamar a `/api/cron/recordatorios`.

- [ ] **Paso 6: Verificar desde la terminal**

  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" https://<url-produccion>/login
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<url-produccion>/api/cron/recordatorios
  curl -s https://<url-produccion>/manifest.webmanifest | head -c 120
  ```

  Esperado: `200`, `401` y un JSON que empieza con `{"name":"Centro El Molino"`.

---

### Tarea 2: Supabase — Vault y tareas programadas

- [ ] **Paso 1: Cargar URL y secreto en Vault**

  *Supabase → SQL Editor*: pegar el contenido de `supabase/snippets/configurar-vault.sql`, reemplazar la URL de producción (Tarea 1) y el `CRON_SECRET` (el mismo que se cargó en Vercel), y ejecutar.

- [ ] **Paso 2: Verificar los jobs**

  ```sql
  select jobname, schedule, active from cron.job order by jobname;
  ```

  Esperado: `cerrar-comidas-vencidas` (`*/5 * * * *`), `limpiar-historial-cron` (diario) y `recordatorios-hora-limite` (`*/5 * * * *`), todos activos.

- [ ] **Paso 3: Verificar que el cron llega a la app (esperar ~10 min)**

  ```sql
  select j.jobname, d.status, d.return_message, d.start_time
  from cron.job_run_details d join cron.job j using (jobid)
  order by d.start_time desc limit 6;

  select status_code, created from net._http_response order by created desc limit 3;
  ```

  Esperado: corridas `succeeded` y respuestas `202`. Si aparece `401`, el `CRON_SECRET` de Vault no coincide con el de Vercel.

---

### Tarea 3: Supabase — ajustes de Auth y API (panel)

- [ ] **Registro público:** *Authentication → Sign In / Providers*: desactivar **"Allow new users to sign up"**. Dejar **Email habilitado**, porque de él depende el login.
- [ ] **Límites de Auth:** todos los inicios de sesión salen desde Vercel, así que el centro entero comparte los límites por IP. En *Authentication → Rate Limits*, subir los inicios de sesión y los refrescos de token (por ejemplo, a 300 y 1000 cada 5 min).
- [ ] **API:** *Project Settings → Data API → Max rows* debe seguir en **1000** (Mensajes lo asume).
- [ ] **Verificar el registro cerrado:**

  ```bash
  curl -s -X POST "https://ekjoyicwscxlixwzwrle.supabase.co/auth/v1/signup" \
    -H "apikey: <anon key>" -H "Content-Type: application/json" \
    -d '{"email":"intruso@example.com","password":"12345678"}'
  ```

  Esperado: error `signup_disabled`.

---

### Tarea 4: Prueba en producción con cuentas demo

- [ ] **Paso 1: Recorrido por rol**
  - `residente@demo.test`: Plan semanal, cambiar una comida de la semana siguiente, "Volver a mi plan", publicar y reaccionar en Mensajes, Calendario en solo lectura, cambiar el propio nombre.
  - `administracion@demo.test`: la Semana muestra el resumen y el cambio del residente resaltado.
  - `director@demo.test`: crear, editar y eliminar un evento; borrar un mensaje ajeno y verlo en el Registro; cambiar una hora límite y restaurarla; crear una cuenta de prueba con contraseña temporal y verificar que pide cambiarla.
- [ ] **Paso 2: Instalar la PWA**
  - En Android (Chrome): "Instalar app".
  - En iPhone (Safari): *Compartir → Agregar a pantalla de inicio*.
- [ ] **Paso 3: Notificaciones**
  - **Activar:** en la app instalada, *Configuraciones → Notificaciones en este dispositivo → Activar*.
  - **Aviso de mensaje:** publicar desde otra cuenta. Debe llegar la notificación y abrir `/mensajes`.
  - **Recordatorio:**
    1. Elegir una comida cuyo cierre todavía no pasó y dejarla "Sin definir" para la cuenta del dispositivo (quitarla de su Plan semanal).
    2. Poner su hora límite a unos 65 minutos de ahora.
    3. Esperar el recordatorio.
    4. Restaurar la hora.
  - **Cerrar sesión:** después de cerrar sesión en el dispositivo, no debe llegar ningún aviso más.

---

### Tarea 5: Limpieza y cuentas reales

- [ ] **Paso 1: Borrar los datos demo**

  ```bash
  npm run limpiar-datos-demo -- --confirmar
  ```

  Borra las cuentas `@demo.test` y, en cascada, sus planes, selecciones, mensajes, eventos y suscripciones.

- [ ] **Paso 2: Vaciar tablas de estado del desarrollo** (SQL Editor)

  ```sql
  delete from public.comidas_cerradas;
  delete from public.avisos_enviados;
  select
    (select count(*) from public.perfiles) as perfiles,
    (select count(*) from public.mensajes) as mensajes,
    (select count(*) from public.eventos) as eventos,
    (select count(*) from public.plan_semanal) as planes,
    (select count(*) from public.selecciones_comida) as selecciones,
    (select count(*) from public.suscripciones_push) as suscripciones;
  ```

  Esperado: todo en `0`. Si quedaron cuentas de prueba que no son demo, borrarlas en *Authentication → Users*.

- [ ] **Paso 3: Primer Director real**

  ```bash
  npm run crear-director -- --nombre "<Nombre>" --siglas <XX> --correo <correo>
  ```

  Entregar la contraseña temporal en persona. Al entrar se pide elegir una nueva.

- [ ] **Paso 4:** el Director revisa las horas límite y crea las cuentas del centro desde *Configuraciones → Gestión de usuarios*.

---

### Tarea 6: Seguridad y cierre

- [ ] **Rotar los secretos que se compartieron por chat durante el desarrollo:**
  - la contraseña de la base (*Project Settings → Database*); después actualizar `SUPABASE_DB_PASSWORD` en `.env.local`;
  - las llaves de API: migrar a las nuevas *publishable/secret keys* y desactivar las JWT heredadas (*Project Settings → API Keys*); después actualizar `.env.local` y las variables de Vercel y redesplegar.
- [ ] **Claves JWT asimétricas** (*Project Settings → JWT Keys*), para que `getClaims()` no llame a Auth en cada request.
- [ ] **Propiedad:** si el proyecto de Supabase o de Vercel está en una cuenta personal, transferirlo a una organización del centro o del dueño.
- [ ] **Plan Hobby de Vercel:** confirmar que el uso es no comercial; si no, pasar a Pro.
- [ ] **Proteger `master`** en GitHub (PR con aprobación y checks `calidad` y `base-de-datos`).
- [ ] **Regla posterior al lanzamiento:**
  - `datos-demo` ya no se ejecuta;
  - toda migración pasa primero por CI y se aplica con `npm run db:aplicar` inmediatamente después del merge (o con la Action, cuando tenga secretos y `[remotes.produccion]`);
  - las pruebas de notificaciones se hacen solo con cuentas propias.

---

### Seguimiento (no bloquea el lanzamiento)

Menores detectados en las revisiones de código, para PRs posteriores:

- **Comidas:**
  - no perder la nota ante un error de red;
  - incrementar el contador de guardado del plan también al cambiar el estado;
  - esperar a que termine el guardado en las aserciones e2e;
  - devolver el foco al chip al cerrar el editor.
- **Mensajes:**
  - no ejecutar `router.refresh()` con texto escrito;
  - fallback de `crypto.randomUUID()` en contextos no seguros;
  - conservar el id de envío al cerrar la caja de respuesta;
  - e2e de persistencia de reacciones.
- **Calendario:**
  - devolver el foco al diálogo si el evento en edición desaparece;
  - mover `FECHA_MINIMA`/`FECHA_MAXIMA` a un módulo propio;
  - revisar si se abre el teclado del celular al abrir un día vacío.
- **Configuraciones:**
  - revertir el correo ante un error ambiguo de Auth;
  - `aria-disabled` en los botones pendientes y en `BotonEnvio`;
  - límite de 72 bytes, no de 72 caracteres, en las contraseñas;
  - mover `MENSAJE_CORREO_REPETIDO` a `lib/cuentas/`;
  - separar `acciones.ts`;
  - unificar `llamar-accion.ts` local con `lib/acciones/llamar.ts`.
- **Fase 0 / plataforma:**
  - `GRANT UPDATE` por columnas en `horas_limite`;
  - verificación de tipos de los enums de TS contra la base;
  - `[remotes.produccion]` en `config.toml` antes de activar la Action de migraciones;
  - `setup-cli` fijado por SHA;
  - `permissions: contents: read` en `ci.yml`.
