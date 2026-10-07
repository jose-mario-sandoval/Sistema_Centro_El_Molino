# Etiquetas y nota de enfermo para Administración; entrar con usuario — diseño

Tres pedidos del usuario (2026-10-05), en un solo spec y tres PR:

| # | Pedido | PR |
|---|---|---|
| 1 | Administración ve la etiqueta de los eventos (San Rafael, San Gabriel, San Miguel, Otro) | 1 |
| 2 | Cuando alguien marca "Enfermo", a Administración no le sale lo que puede comer | 1 |
| 3 | Entrar con nombre de usuario en vez de correo; el Director no debe ver correos ni nombres de Administración | 2 y 3 |
| 4 | Dejar la app lista para instalar en el teléfono y recibir notificaciones | prueba guiada, sin código |

Hallazgos del análisis:

- **La app nunca manda correos.** No hay recuperación de contraseña por correo (la contraseña
  temporal la pone el Director): el correo solo es el identificador para entrar. Quitarlo no le saca
  nada a nadie.
- **Instalar y avisos ya están en producción** (PR #28). Comprobado desde afuera el 2026-10-05:
  `/manifest.webmanifest` (`display: standalone`) y `/sw.js` responden, y la llave pública VAPID está
  puesta (el script de `<head>` sale con `conAvisos = true`). Lo que no se ve desde afuera —
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET` en Vercel y `url_app` / `cron_secret` en Vault—
  solo se confirma con la prueba de §4.
- **El desglose de la cocina descarta la nota de enfermo a propósito** (spec del 2026-09-26 §2:
  "enfermo, solo cantidad, nunca la nota"). El pedido 2 revierte esa decisión.

## Decisiones tomadas con el usuario

1. Administración ve la etiqueta **solo en los eventos que ya ve** (los que piden algo a la cocina).
   El título sigue oculto.
2. Las cuentas que ya existen reciben su usuario **solas**: las de la casa, lo que va antes de la
   arroba de su correo; las de Administración, `admin.1`, `admin.2`… El Director los cambia después.
3. **La casa no ve el nombre real de Administración**: esas cuentas se llaman "Administración 1" /
   "A1". Al crearlas no se pide nombre, y las que ya existen se renombran.
4. El usuario lo pone y lo cambia **solo el Director**; cada persona lo ve en "Mi cuenta" sin poder
   editarlo (es la llave para entrar: que nadie lo cambie y lo olvide).
5. Enfoque del login: el usuario vive en `perfiles` y el servidor busca la cuenta al entrar (§3,
   "Enfoque").

## 1. Etiquetas de evento para Administración (PR 1)

### Reglas

1. `eventos_para_cocina(p_desde, p_hasta)` devuelve además `tipo`. Mismo filtro que hoy (casilla o
   pedido libre), mismo `security definer`, nunca `titulo` ni `serie_id`. Cambia el `RETURNS TABLE`:
   `drop function` + `create`, y se repiten `revoke` / `grant`.
2. `EventoParaCocina` gana `tipo: TipoEvento`; `eventoParaAdministracion()` lo pasa al `Evento`
   (`titulo` sigue siendo el texto del pedido).
3. **Lo que Administración sigue sin ver:** el título, los eventos sin pedido, los filtros del
   calendario y las ausencias.

### Pantallas

- **Cuadrícula del mes:** sus eventos llevan el color y la marca del tipo (SR / SG / SM / Otro), con
  los mismos tokens `--ev-<tipo>` y `MARCA_TIPO` que la casa. En teléfono angosto queda la inicial,
  igual que para la casa.
- **Lista (agenda) y detalle del día:** además del color, la pastilla con el nombre completo ("San
  Gabriel"), como la ve la casa. No se repiten las pastillas de pedido: para Administración el texto
  del evento ya es el pedido.
- **Nombre accesible del día:** incluye el tipo, como para la casa.
- **Sin filtros.** `conFiltros` sigue en `false` para Administración. Como ahora sus eventos llevan
  `data-tipo`, los filtros que otra persona haya guardado en ese mismo dispositivo
  (`html[data-cal-oculta]`, CSS previo a la hidratación) no deben ocultarle nada, ni un instante:
  `.zona-calendario` sale con `data-listo` desde el servidor cuando no hay filtros.

### Avisos push a la cocina

- `paraCocina()` deja pasar también `tipo`. El texto lo nombra junto a la fecha:
  "Jueves 1/10, 15:00 · San Gabriel: Merienda". «Otro» no se nombra en el aviso: no le dice nada a
  la cocina.
- `cambioPedidoCocina()` no cambia: si solo cambia la categoría (o el título), no hay aviso nuevo.
- `cargaSeriePedidos()`: nombra el tipo si todas las fechas lo comparten.

## 2. Nota de enfermo en el desglose de la cocina (PR 1)

1. `resumenComida()`: la parte de un estado con nota de texto (`INFO_ESTADO[estado].nota ===
   'texto'`, hoy solo `enfermo`) lleva `notas: string[]`, una por persona que escribió algo, en el
   orden de las personas y sin agrupar. Nunca nombres ni siglas. `parte.texto` sigue siendo el corto
   ("1 enfermo").
2. `CeldaResumen` las pinta debajo de la línea del estado, una por renglón, en letra normal (son
   texto libre y pueden ser largas: el renglón parte, no se recorta).
3. Un solo ayudante, `textoParte(parte)`, da el texto corrido con las notas entre paréntesis
   separadas por "; ": "1 enfermo (sopa de pollo)". Lo usan los dos lugares que arman texto corrido:
   `etiquetaCeldaCasa()` (`lib/comidas/casa.ts`, el nombre accesible del botón de cada celda de "La
   casa": tiene que decir todo lo que se ve escrito) y `textoResumen()`.
4. Plural: "2 enfermos".
5. Sale igual donde se usa el mismo resumen: Semana y Plan de Administración, y "La casa" del
   Director.

## 3. Entrar con usuario (PR 2 y PR 3)

### Enfoque

Supabase Auth exige un correo para entrar con contraseña. Opciones:

- **A. Correo derivado del usuario** (`r.flores@…`): el login no consulta nada, pero cambiar el
  usuario obliga a cambiar Auth, y el día del cambio hay que reescribir todas las cuentas en el mismo
  minuto del despliegue; mientras tanto nadie entra.
- **B. Usuario en `perfiles` + búsqueda en el servidor (elegida).** El correo de Auth pasa a ser una
  dirección interna que nadie ve ni escribe. Cambiar el usuario es actualizar una columna. Las
  cuentas actuales siguen entrando sin tocar Auth, y sus correos reales se borran después, cuando ya
  se comprobó que todo funciona.
- **C. Autenticación propia:** descartada; todo el RLS depende de `auth.uid()`.

### Reglas

1. **`perfiles.usuario`**: texto, obligatorio y único. Se guarda normalizado. Formato: 3 a 30
   caracteres, `^[a-z0-9]+([._-][a-z0-9]+)*$` (el mismo `check` en la base y en zod). El prefijo
   `demo.` queda reservado para los scripts de demo: lo rechazan solo los dos formularios del
   Director (crear cuenta y cambiar usuario), no el `check` de la base, ni `crearCuenta()`, ni el
   login.
2. **`normalizarUsuario()`** (`lib/cuentas/usuario.ts`): quita espacios de los extremos, pasa a
   minúsculas y quita tildes y la virgulilla de la ñ. "R.Flores" = "r.flores"; "Muñoz" = "munoz".
   Se usa al crear, al cambiar y al entrar.
3. **Entrar** (`iniciarSesion`):
   1. Normaliza lo escrito. Si trae "@" (costumbre, o el teléfono rellenó el correo guardado), se
      le aplica `usuarioDesdeCorreo()`: la misma limpieza con la que la migración A armó los usuarios
      (ver "Cuentas que ya existen"), para que el correo de siempre lleve al usuario que le tocó.
   2. Con la llave secreta: `perfiles` por `usuario` → `id` → `auth.admin.getUserById(id)` → la
      dirección de Auth.
   3. `signInWithPassword` con esa dirección. Si el usuario no existe, se intenta igual con una
      dirección interna inexistente: mismo camino, mismo mensaje ("Usuario o contraseña
      incorrectos."), para no revelar qué usuarios existen.
   4. Lo demás no cambia: cuenta desactivada, cambio de contraseña obligatorio, redirección.
4. **Dirección interna:** las cuentas nuevas se crean en Auth con
   `<uuid aleatorio>@cuentas.molino.invalid` (constante `DOMINIO_INTERNO`; `.invalid` nunca recibe
   correo). No depende del usuario: cambiarlo no toca Auth.
5. **Nombre genérico de Administración:** una cuenta con rol `administracion` se llama
   `Administración N` con siglas `AN`. N = 1 + el mayor número que aparezca en un `nombre` con la
   forma `Administración <número>` en **cualquier** perfil (de cualquier rol, activo o no): así no se
   repite un número que alguien todavía lleva, sin guardar un contador. Lo calcula el servidor al
   crear la cuenta o al pasarla a ese rol.
6. **Cambios de rol:**
   - A Administración: la cuenta toma el nombre genérico que sigue. Pasa por la confirmación que ya
     existe para el rol Director, diciendo cómo va a llamarse.
   - Desde Administración a otro rol: conserva el nombre genérico hasta que la persona lo cambie en
     "Mi cuenta", que para ella vuelve a ser editable.
7. **Quién escribe qué** (siempre en el servidor, con `perfilParaAccion()`):
   - `crearNuevaCuenta` (Director): `usuario`, `rol`, contraseña temporal; `nombre` y `siglas` solo
     si el rol no es Administración.
   - `cambiarUsuarioCuenta` (Director, cualquier cuenta, también la suya): nuevo `usuario`; repetido
     → "Ya existe una cuenta con ese usuario."
   - `guardarMiCuenta` (cada quien): solo `nombre` y `siglas`; rechaza a Administración. Desaparece
     todo el manejo de correo y su reversión en Auth.
   - `cambiarMiContrasena` no cambia: ya toma la dirección de `auth.getUser()`.

### Pantallas

- **Login:** campo "Usuario" (`autoComplete="username"`, sin mayúscula automática, sin corrector).
- **Ajustes → Mi cuenta:** Nombre y Siglas (solo lectura para Administración, con la explicación),
  Usuario (solo lectura: "Con este usuario iniciás sesión. Para cambiarlo, hablá con el Director."),
  Rol.
- **Ajustes → Gestión de usuarios (Director):** la columna "Correo" pasa a "Usuario"; cada fila
  (también la propia) tiene "Cambiar usuario".
- **Nueva cuenta:** primero el Rol. Con Administración no se piden nombre ni siglas (se muestra cómo
  va a llamarse) y el usuario viene propuesto como `admin.N`, editable. Al crear, la pantalla de
  entrega muestra usuario y contraseña temporal.

### Cuentas que ya existen (migración A)

**La limpieza** (una sola regla: en SQL dentro de la migración y en TS como `usuarioDesdeCorreo()`,
con la misma tabla de casos en la prueba unitaria y en el banco SQL). De lo que va antes de la
arroba:

1. minúsculas, y una lista fija de reemplazos, la misma en los dos lados (`á é í ó ú ü ñ` →
   `a e i o u u n`); cualquier otra letra con marca cae en el paso 2;
2. se quita todo lo que no sea `a-z`, `0-9`, `.`, `_` o `-`;
3. varios separadores seguidos quedan en el primero, y se quitan los de los extremos;
4. se corta a 30 caracteres (y se vuelve a quitar un separador final);
5. si quedan menos de 3: `cuenta.<lo que quedó>`, o `cuenta` si no quedó nada.

El prefijo `demo.` y los sufijos `.2`, `.3` cuentan dentro de los 30: si no entran, se recorta la
base.

**Quién recibe qué:**

- **Cuentas de demo** (correo `@demo.test`, de cualquier rol): `usuario` = `demo.<limpio>`. Van
  primero, para que no le quiten el usuario a una cuenta real.
- **Administración**, por antigüedad: `usuario` = `admin.N`, `nombre` = `Administración N`,
  `siglas` = `AN` (las de demo conservan su `demo.…` y también toman el nombre genérico). El nombre
  real se pierde en este paso.
- **Casa** (Director, Residente): `usuario` = el limpio.
- **Repetidos:** al más antiguo le queda el limpio; a los siguientes, `.2`, `.3`…
- `usuario` queda `not null` y único; `correo` pasa a admitir nulos (el código nuevo ya no lo
  escribe).
- La migración termina con una consulta que lista, por cuenta, el correo de antes (para saber quién
  es quién: las siglas de Administración ya son `A1`, `A2`), el rol, el usuario y una marca "avisar"
  en las que no se deducen de su correo (Administración, repetidos, los de menos de 3). Al pegarla
  en el SQL Editor, el resultado es la lista para repartir. El archivo no lleva ningún dato real (el
  repo es público).
- La contraseña y las sesiones abiertas de cada quien no cambian: nadie queda afuera.

### Borrar los correos (PR 3)

Después de comprobar en producción que la gente entra, en este orden:

1. **`npm run borrar-correos -- --confirmar`** (script nuevo): a toda cuenta de Auth cuya dirección
   no sea interna le pone una interna nueva con `auth.admin.updateUserById(id, { email,
   email_confirm: true })`, la misma llamada con la que hoy se cambia un correo en "Mi cuenta". El
   núcleo es una función por cuenta (`pasarADireccionInterna(admin, id)`), que es lo que se prueba.
   Idempotente. Sin `--confirmar` no cambia nada: solo dice cuántas cambiaría (rama propia, no
   `exigirConfirmacion`, que corta antes). No se reescribe el esquema `auth` por SQL.
2. Comprobar otra vez que la gente entra. `perfiles.correo` sigue ahí por si hubiera que restaurar
   alguna dirección.
3. **Migración B:** `alter table perfiles drop column correo`.

"Borrar" abarca `perfiles.correo`, la dirección de la cuenta en Auth y su identidad de correo. Queda
afuera el registro interno de Auth (`auth.audit_log_entries`), que solo ve quien entra al panel de
Supabase.

Va en un PR aparte para que el CI del PR 2 corra contra el mismo esquema que tendrá producción entre
los dos pasos (`correo` todavía presente), y para que no se pueda aplicar antes de tiempo.

**Invariante al cerrar el PR 2:** nada en la app, los scripts ni las pruebas lee o escribe
`perfiles.correo`. Así el PR 3 es la migración, el script y los tipos regenerados.

### Scripts y pruebas de apoyo

- `npm run crear-director -- --nombre … --siglas … --usuario …`.
- Los scripts de demo crean y reconocen sus cuentas por el prefijo de usuario `demo.` en vez del
  dominio del correo.
- `tests/soporte/usuarios-prueba.ts`: cada cuenta de prueba gana `usuario`; su dirección de Auth
  puede seguir siendo la de hoy (el login la busca). Las pruebas que hoy buscan o limpian cuentas por
  correo (login, instalar, mensajes, configuraciones) pasan a hacerlo por `usuario`.
- La prueba del borrado usa una cuenta descartable, creada con un correo de verdad: no toca las
  cuentas de prueba compartidas, que entran con su dirección fija.

## 4. Instalar y notificaciones: prueba en un teléfono

Sin código, salvo que algo falle. Después del PR 2:

1. Abrir la app en el teléfono (Chrome en Android, o Safari en iPhone con iOS 16.4 o más) e
   instalarla desde la franja "Instalar".
2. Abrir la app instalada y entrar con el usuario.
3. Ajustes → Notificaciones → "Activar notificaciones".
4. Desde otra cuenta, en otro dispositivo, publicar un mensaje: tiene que llegar el aviso. Si no
   llega, faltan `VAPID_PRIVATE_KEY` o `VAPID_SUBJECT` en Vercel.
5. Recordatorio de hora límite: la consulta de comprobación de
   `supabase/snippets/configurar-vault.sql` debe dar 202. Un 401 o 404 es `cron_secret` o `url_app`
   mal puestos en Vault.

## Orden de entrega y migraciones

| PR | Rama | Migración | Cuándo aplicarla |
|---|---|---|---|
| 1 | `claude/administracion-etiquetas-enfermo` | `20261005100000_eventos_cocina_tipo.sql` | Antes de mergear (el código viejo ignora la columna nueva) |
| 2 | `claude/entrar-con-usuario` | `20261005110000_usuarios.sql` (A) | Justo antes de mergear: sin ella, con el código nuevo no entra nadie |
| 3 | `claude/borrar-correos` | `20261005120000_borrar_correos.sql` (B) + script | Después de comprobar el PR 2 en producción |

- PR 1 y PR 2 se cruzan en `CLAUDE.md`, en `lib/supabase/database.types.ts` y en las pruebas e2e
  donde el PR 1 agrega casos y el PR 2 cambia cómo se entra (`tests/e2e/calendario.spec.ts`,
  `tests/e2e/comidas.spec.ts`): el segundo se rebasa y regenera los tipos.
- Entre aplicar A y que Vercel termine el despliegue del PR 2 (minutos), "Nueva cuenta" del código
  viejo falla porque no manda `usuario`. Todo lo demás sigue funcionando.
- Hasta el PR 3, volver atrás es revertir el despliegue: los correos siguen en su lugar. Dos cosas
  no se deshacen así: el nombre de las cuentas de Administración (lo cambia A) y las cuentas creadas
  con el código nuevo, que no tienen correo y con el código viejo no podrían entrar.
- Los tres PR regeneran `lib/supabase/database.types.ts` desde el artefacto del CI.
- Documentación: `CLAUDE.md` (qué ve Administración de un evento, enfermo con nota, login por
  usuario, nombres genéricos), `README.md` (script) y `DESIGN.md` (§ calendario: Administración
  recibe el tipo, no los filtros).

## Pruebas

- **Unitarias:** `resumenComida` / `textoResumen` con notas de enfermo; `cargaPedidoCocina` y
  `cargaSeriePedidos` con tipo, y que un cambio solo de categoría no avisa;
  `eventoParaAdministracion` pasa el tipo y nunca un título; `normalizarUsuario` y el esquema;
  `iniciarSesion` (usuario, con "@", inexistente); acciones de Ajustes (crear con usuario, cuenta de
  Administración genérica, cambiar usuario, `guardarMiCuenta` sin correo y rechazada para
  Administración, cambio de rol a Administración).
- **Integración (CI):** `eventos_para_cocina()` devuelve `tipo` y no expone título; crear una cuenta
  y entrar con su usuario de punta a punta; el borrado reemplaza el correo real de una cuenta
  descartable, que sigue entrando con su usuario y ya no con el correo (PR 3).
- **E2E:** entrar con usuario; el Director crea una cuenta de Administración sin escribir nombre;
  Administración ve la etiqueta en el calendario y la nota de enfermo en la semana.
- **Banco SQL local:** el relleno de la migración A con correos raros, repetidos y cuentas de
  Administración.

## Riesgos

- **`.invalid` en Supabase hospedado.** El validador de direcciones de Auth solo corre al enviar
  correos, y la app no envía ninguno; el CI lo prueba con el mismo servidor de Auth. Si producción lo
  rechazara, se cambia la constante `DOMINIO_INTERNO`. Se confirma creando una cuenta de prueba
  apenas despliegue el PR 2.
- **El borrado de correos corre contra producción con la llave secreta** (`.env.local`): es un paso
  manual, una sola vez, y no tiene vuelta atrás. Por eso va al final y pide `--confirmar`.
- **Usuarios que no se deducen del correo:** Administración (`admin.N`), los repetidos (`algo.2`) y
  los de menos de 3 caracteres. La consulta final de la migración A los marca para que el Director
  les avise.
- **La nota de enfermo es texto libre** y llega a la cocina: si alguien escribe un nombre, se ve. La
  única protección es la ayuda del campo ("Qué puede comer").
- **`perfiles` sigue legible por PostgREST** para cualquier cuenta activa (límite ya conocido): eso
  incluye `usuario`. No se resuelve acá.
