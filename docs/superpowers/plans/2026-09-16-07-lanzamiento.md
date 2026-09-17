# Lanzamiento — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usar superpowers:executing-plans para recorrer este checklist tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento. Varias tareas las ejecuta el **dueño del repo** en paneles web: el agente prepara y verifica, no ingresa credenciales.

**Objetivo:** pasar de "todo mergeado" a "el centro usa la app", con el proyecto limpio de datos demo, producción desplegada automáticamente y notificaciones verificadas.

**Arquitectura:** sin código nuevo. Configuración de GitHub, Vercel y Supabase (spec Anexo A), verificaciones con `curl`, SQL de solo lectura y pruebas manuales en celulares.

**Stack:** GitHub Actions, Vercel (Hobby), Supabase (proyecto único), CLI `supabase` y `gh`.

**Referencias:** spec §10, §11 (checklist de lanzamiento), Anexo A · índice [`2026-09-16-00-indice.md`](2026-09-16-00-indice.md).

**Requisito previo:** planes 01 a 06 mergeados en `master` y CI en verde.

---

### Tarea 1: Configuración de GitHub (dueño del repo)

**Archivos:** ninguno.

- [ ] **Paso 1: Proteger `master`**

*Settings → Rules → Rulesets → New branch ruleset*:
- objetivo: `master`;
- exigir pull request con 1 aprobación;
- exigir los checks `calidad` y `base-de-datos`;
- bloquear force push y borrado.

- [ ] **Paso 2: Secretos y variable de Actions**

*Settings → Secrets and variables → Actions*:
- **Secrets:** `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (los tres de Vercel salen de la tarea 2).
- **Variables:** `SUPABASE_PROJECT_REF`.

- [ ] **Paso 3: Verificar desde la terminal**

```bash
gh secret list
gh variable list
gh api repos/jose-mario-sandoval/Sistema_Centro_El_Molino/rulesets --jq '.[].name'
```

Esperado: aparecen los 5 secretos, la variable `SUPABASE_PROJECT_REF` y el ruleset de `master`.

---

### Tarea 2: Proyecto en Vercel (dueño del repo)

**Archivos:** ninguno.

- [ ] **Paso 1: Crear el proyecto**

1. Entrar a Vercel con el login de GitHub del dueño (plan Hobby).
2. *Add New → Project* e importar `Sistema_Centro_El_Molino`, framework Next.js.
3. *Settings → Git*: Production Branch = `master` (los despliegues por Git quedan desactivados por `vercel.json`).

- [ ] **Paso 2: Variables de entorno de Production**

*Settings → Environment Variables*, entorno **Production**:

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL de Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | anon / publishable key |
| `SUPABASE_SECRET_KEY` | service_role / secret key |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | salida de `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | `mailto:` de contacto del centro |
| `CRON_SECRET` | salida de `openssl rand -hex 32` |

Las llaves VAPID y el `CRON_SECRET` de producción los genera el dueño en su computadora; **no** son los de `.env.local` de los colaboradores.

- [ ] **Paso 3: Desactivar la protección de despliegues**

*Settings → Deployment Protection*: desactivar **Vercel Authentication**, para que el centro abra la app sin cuenta de Vercel y `pg_cron` pueda llamar a `/api/cron/recordatorios`.

- [ ] **Paso 4: Token e identificadores para la Action**

1. *Account Settings → Tokens*: crear `github-actions-molino`.
2. `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID`: *Project Settings → General* (o `.vercel/project.json` tras `npx vercel link`).
3. Cargar los tres como secretos de GitHub (tarea 1, paso 2).

---

### Tarea 3: Primer despliegue automático

**Archivos:** ninguno.

- [ ] **Paso 1: Disparar la Action**

```bash
gh workflow run "Desplegar producción" --ref master
gh run watch
```

Esperado: pasos *Vincular proyecto Supabase*, *Ajustes de Auth*, *Migraciones*, *Build* y *Desplegar* en verde. El log de *Desplegar* termina con la URL de producción.

- [ ] **Paso 2: Anotar la URL de producción**

```bash
gh run view --log | grep -Eo "https://[a-z0-9-]+\.vercel\.app" | tail -1
```

Esperado: algo como `https://sistema-centro-el-molino.vercel.app`. Usar el dominio de producción del proyecto, no la URL de un despliegue puntual.

- [ ] **Paso 3: Verificar que un commit de un colaborador también despliega**

Mergear un PR cuyo autor sea un colaborador (no el dueño) y revisar que la Action termine en verde (spec §10: requisito de repo público en Vercel Hobby).

Esperado: despliegue exitoso. Si falla con "Git author must have access", confirmar que el repo es público; si lo es y aun así falla, la vía soportada es el plan Pro.

---

### Tarea 4: Supabase: Vault, cron y Auth

**Archivos:** ninguno (se usa `supabase/snippets/configurar-vault.sql` del plan 06).

- [ ] **Paso 1: Guardar URL y secreto en Vault**

En *Supabase → SQL Editor*, abrir el contenido de `supabase/snippets/configurar-vault.sql`, reemplazar la URL de producción (tarea 3) y el `CRON_SECRET` de Vercel, y ejecutar.

- [ ] **Paso 2: Verificar las tareas programadas**

```sql
select jobname, schedule, active from cron.job order by jobname;
```

Esperado: `cerrar-comidas-vencidas` y `recordatorios-hora-limite`, ambos `*/5 * * * *` y `active = true`.

Después de 10 minutos:

```sql
select j.jobname, d.status, d.start_time
from cron.job_run_details d join cron.job j using (jobid)
order by d.start_time desc limit 6;

select status_code, created from net._http_response order by created desc limit 3;
```

Esperado: corridas `succeeded` y respuestas `202` de `/api/cron/recordatorios`.

- [ ] **Paso 3: Verificar que el registro público está cerrado**

```bash
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" -H "Content-Type: application/json" \
  -d '{"email":"intruso@example.com","password":"12345678"}'
```

(Con las variables de `.env.local` cargadas en la terminal.) Esperado: error `signup_disabled` / "Signups not allowed for this instance". Confirmar también en *Authentication → Sign In / Providers* que "Allow new users to sign up" está desactivado.

- [ ] **Paso 4: Verificar que el cron rechaza llamadas sin secreto**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<url-produccion>/api/cron/recordatorios
```

Esperado: `401`.

---

### Tarea 5: Prueba de notificaciones con cuentas propias

**Archivos:** ninguno.

- [ ] **Paso 1: Android (Chrome)**

1. Abrir la URL de producción con una cuenta demo de rol residente y "Instalar app".
2. *Configuraciones → Notificaciones en este dispositivo → Activar*.
3. Desde otra cuenta demo, publicar un mensaje.

Esperado: llega la notificación y al tocarla abre `/mensajes`.

- [ ] **Paso 2: iPhone (iOS 16.4 o superior)**

1. En Safari, abrir la URL, verificar que aparecen las instrucciones de instalación y "Agregar a pantalla de inicio".
2. Abrir desde el ícono, activar notificaciones y repetir la publicación desde otra cuenta.

Esperado: llega la notificación.

- [ ] **Paso 3: Recordatorio de hora límite**

1. Con la cuenta demo `director@demo.test`, poner temporalmente la hora límite de la cena a ~65 minutos de la hora actual.
2. Borrar el plan de cena de hoy de una cuenta demo de prueba (queda "Sin definir").
3. Esperar a que llegue el recordatorio (entre 55 y 60 minutos antes del cierre).
4. Restaurar la hora límite original (16:00, mismo día).

Esperado: la notificación llega solo a la cuenta con la cena "Sin definir".

- [ ] **Paso 4: Cerrar sesión da de baja el dispositivo**

Cerrar sesión en el celular y publicar otro mensaje desde otra cuenta.

Esperado: no llega notificación a ese dispositivo.

---

### Tarea 6: Limpieza de datos demo

**Archivos:** ninguno.

- [ ] **Paso 1: Borrar todo lo demo**

```bash
npm run limpiar-datos-demo -- --confirmar
```

Esperado: `Borrada: …@demo.test` por cada cuenta y `Cuentas demo borradas: 5` (o las que existan).

- [ ] **Paso 2: Verificar que no quedó nada**

En *SQL Editor*:

```sql
select
  (select count(*) from public.perfiles) as perfiles,
  (select count(*) from public.mensajes) as mensajes,
  (select count(*) from public.eventos) as eventos,
  (select count(*) from public.plan_semanal) as planes,
  (select count(*) from public.selecciones_comida) as selecciones,
  (select count(*) from public.suscripciones_push) as suscripciones;
```

Esperado: todo en `0`. Si queda algo de pruebas hechas con cuentas no demo, borrar esas cuentas desde *Authentication → Users* (el cascade limpia su contenido).

- [ ] **Paso 3: Limpiar historial de cierres y avisos de desarrollo**

```sql
delete from public.comidas_cerradas;
delete from public.avisos_enviados;
```

Esperado: `DELETE n`. La tarea de cierre vuelve a crear solo lo que corresponda.

---

### Tarea 7: Primer Director real y cuentas del centro

**Archivos:** ninguno.

- [ ] **Paso 1: Crear el Director**

```bash
npm run crear-director -- --nombre "<Nombre real>" --siglas <XX> --correo <correo real>
```

Esperado: `Director creado` y una contraseña temporal. Entregarla en persona, no por chat.

- [ ] **Paso 2: Primer ingreso del Director**

El Director entra, elige su contraseña y revisa *Configuraciones → Horas límite* (desayuno 21:00 del día anterior, almuerzo 10:00, cena 16:00, o las que decida).

- [ ] **Paso 3: Cuentas del resto del centro**

Desde *Gestión de usuarios*, el Director crea las cuentas de Directores, Residentes y Administración con contraseñas temporales.

Esperado: cada persona, al entrar, debe elegir su contraseña.

---

### Tarea 8: Cierre administrativo

**Archivos:** ninguno.

- [ ] **Paso 1: Propiedad del proyecto de Supabase**

Si el proyecto está en una cuenta personal de un colaborador, transferirlo a una organización del centro o del dueño: *Project Settings → General → Transfer project* (spec Anexo A.1).

- [ ] **Paso 2: Plan Hobby de Vercel**

Confirmar que el uso del centro es no comercial. Si no, pasar el proyecto a Pro antes de dar acceso.

- [ ] **Paso 3: Instrucciones para el centro**

Enviar a las personas del centro (por el canal habitual del centro) un mensaje breve con:
- la URL;
- que la contraseña inicial es temporal;
- cómo instalar la app en Android ("Instalar app") y en iPhone ("Compartir → Agregar a pantalla de inicio");
- cómo activar las notificaciones en *Configuraciones*.

- [ ] **Paso 4: Regla posterior al lanzamiento**

Recordar a ambos colaboradores (spec §10):
- `npm run datos-demo` **ya no se ejecuta**;
- las pruebas de notificaciones se hacen solo con cuentas propias;
- toda migración pasa primero por CI.
