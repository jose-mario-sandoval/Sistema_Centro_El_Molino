# Entrar con usuario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada persona entre con un nombre de usuario en vez de un correo, que el Director deje de ver correos, y que las cuentas de Administración lleven un nombre genérico.

**Architecture:** `perfiles.usuario` (único, normalizado) es lo que se escribe para entrar; el login busca en el servidor la dirección de Auth de esa cuenta (`perfiles` → `auth.admin.getUserById`) y entra con ella. Las cuentas nuevas se crean en Auth con una dirección interna opaca (`<uuid>@cuentas.molino.invalid`), así cambiar el usuario es actualizar una columna. La migración A rellena `usuario` en las cuentas que existen y deja `correo` nulable; borrar los correos queda para el PR 3.

**Tech Stack:** Next.js 16 (Server Actions), React 19, Supabase Auth + PostgreSQL, zod 4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-administracion-etiquetas-y-usuarios-design.md` §3 (todo menos "Borrar los correos", que es el PR 3).

**Rama:** `claude/entrar-con-usuario`, apilada sobre `claude/administracion-etiquetas-enfermo` (PR 1). Antes de abrir el PR, rebasar sobre `master` si el PR 1 ya se mergeó.

**Invariante al terminar:** nada en la app, los scripts ni las pruebas lee o escribe `perfiles.correo` (el `select('*')` de `obtenerPerfilActual` lo sigue trayendo hasta el PR 3, pero nadie lo usa).

---

## Archivos

| Archivo | Qué cambia |
|---|---|
| `lib/cuentas/usuario.ts` | **nuevo**: normalizar, validar, limpiar un correo viejo, direcciones internas |
| `lib/cuentas/administracion.ts` | **nuevo**: nombre genérico "Administración N" |
| `lib/cuentas/direccion-de-acceso.ts` | **nuevo**: usuario → dirección de Auth (con la llave secreta) |
| `lib/cuentas/crear-cuenta.ts` | crea con `usuario` y dirección interna |
| `tests/fixtures/casos-usuario.json` | **nuevo**: casos de limpieza compartidos por TS y por el banco SQL |
| `supabase/migrations/20261005110000_usuarios.sql` | **nuevo**: migración A |
| `lib/supabase/database.types.ts` | `usuario`, `correo` nulable (a mano; después, el artefacto del CI) |
| `lib/validacion/auth.ts`, `lib/validacion/configuraciones.ts` | esquemas con `usuario` |
| `lib/configuraciones/errores.ts`, `tipos.ts`, `consultas.ts` | `usuario` en vez de `correo` |
| `app/login/acciones.ts`, `formulario-login.tsx` | login por usuario |
| `app/(app)/configuraciones/acciones.ts` | sin correo; `cambiarUsuarioCuenta`; nombre genérico |
| `app/(app)/configuraciones/_componentes/` | Mi cuenta, fila, nueva cuenta, cambiar rol, contraseña temporal; **nuevo** `modal-cambiar-usuario.tsx` |
| `scripts/crear-director.ts`, `scripts/demo/*`, `scripts/datos-demo.ts`, `scripts/limpiar-datos-demo.ts` | `usuario` |
| `tests/soporte/usuarios-prueba.ts`, `tests/soporte/supabase-falso.ts` | `usuario` |
| `tests/unit/…`, `tests/integration/cuentas.test.ts` (**nuevo**), `tests/e2e/*.spec.ts` | pruebas |
| `CLAUDE.md`, `README.md` | reglas y comandos |

---

### Task 1: `lib/cuentas/usuario.ts`

**Files:**
- Create: `lib/cuentas/usuario.ts`, `tests/fixtures/casos-usuario.json`
- Test: `tests/unit/cuentas/usuario.test.ts`

- [ ] **Step 1: Casos compartidos** — `tests/fixtures/casos-usuario.json` (los usa esta prueba y el banco SQL de la Task 3: la limpieza es la misma regla en TS y en SQL):

```json
{
  "_": "Parte local de un correo viejo → usuario. Espejo: usuarioDesdeCorreo() en lib/cuentas/usuario.ts y pg_temp.limpiar_usuario() en la migración 20261005110000.",
  "casos": [
    ["rflores@gmail.com", "rflores"],
    ["R.Flores@Gmail.com", "r.flores"],
    ["juan_perez-2@centro.org", "juan_perez-2"],
    ["juan+algo@centro.org", "juanalgo"],
    ["josé.muñoz@centro.org", "jose.munoz"],
    ["a..b__c@x.org", "a.b_c"],
    ["a.-_b@x.org", "a.b"],
    [".punto.@x.org", "punto"],
    ["jp@x.org", "cuenta.jp"],
    ["j@x.org", "cuenta.j"],
    ["+++@x.org", "cuenta"],
    ["abcdefghijklmnopqrstuvwxyz0123456789@x.org", "abcdefghijklmnopqrstuvwxyz0123"],
    ["abcdefghijklmnopqrstuvwxyz012.456@x.org", "abcdefghijklmnopqrstuvwxyz012"],
    ["ÑANDÚ@x.org", "nandu"]
  ]
}
```

- [ ] **Step 2: Prueba que falla** — `tests/unit/cuentas/usuario.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  direccionInterna,
  DOMINIO_INTERNO,
  esDireccionInterna,
  FORMATO_USUARIO,
  normalizarUsuario,
  usuarioDesdeCorreo,
  usuarioParaEntrar,
  usuarioValido,
} from '@/lib/cuentas/usuario'
import casos from '../../fixtures/casos-usuario.json'

describe('normalizarUsuario', () => {
  it('quita espacios de los extremos, pasa a minúsculas y quita tildes y la virgulilla', () => {
    expect(normalizarUsuario('  R.Flores ')).toBe('r.flores')
    expect(normalizarUsuario('MUÑOZ')).toBe('munoz')
    expect(normalizarUsuario('José.Peña')).toBe('jose.pena')
    // Aunque el teléfono mande la tilde como marca aparte (NFD).
    expect(normalizarUsuario('josé')).toBe('jose')
  })
})

describe('usuarioValido', () => {
  it.each(['r.flores', 'admin.1', 'juan_perez-2', 'abc', 'a'.repeat(30)])('acepta %s', (usuario) => {
    expect(usuarioValido(usuario)).toBe(true)
  })

  it.each(['ab', 'a'.repeat(31), 'R.Flores', 'r..flores', '.rflores', 'rflores.', 'r flores', 'r@flores', 'muñoz', ''])(
    'rechaza %s',
    (usuario) => {
      expect(usuarioValido(usuario)).toBe(false)
    },
  )
})

describe('usuarioDesdeCorreo: la limpieza de la migración (casos compartidos con el banco SQL)', () => {
  it.each(casos.casos as [string, string][])('%s → %s', (correo, usuario) => {
    expect(usuarioDesdeCorreo(correo)).toBe(usuario)
  })

  it('lo que devuelve siempre cumple el formato', () => {
    for (const [correo] of casos.casos as [string, string][]) {
      expect(usuarioValido(usuarioDesdeCorreo(correo)), correo).toBe(true)
    }
    expect(FORMATO_USUARIO.test('cuenta')).toBe(true)
  })
})

describe('usuarioParaEntrar: lo que se escribió en el login', () => {
  it('un usuario, normalizado', () => {
    expect(usuarioParaEntrar(' R.Flores ')).toBe('r.flores')
  })

  it('un correo (costumbre, o lo rellenó el teléfono): el usuario que le tocó a esa cuenta', () => {
    expect(usuarioParaEntrar('RFlores@Gmail.com')).toBe('rflores')
    expect(usuarioParaEntrar('juan+algo@centro.org')).toBe('juanalgo')
  })
})

describe('direcciones internas de Auth', () => {
  it('cada cuenta nueva recibe una distinta, en el dominio interno', () => {
    const a = direccionInterna()
    expect(a).toMatch(new RegExp(`^[0-9a-f-]{36}@${DOMINIO_INTERNO.replaceAll('.', '\\.')}$`))
    expect(direccionInterna()).not.toBe(a)
  })

  it('se reconocen', () => {
    expect(esDireccionInterna(direccionInterna())).toBe(true)
    expect(esDireccionInterna('rflores@gmail.com')).toBe(false)
    expect(esDireccionInterna(null)).toBe(false)
  })
})
```

Si `tsc` no deja importar el JSON, mirar cómo lo importa la prueba de paridad de `tests/fixtures/casos-comidas.json` y hacer lo mismo.

- [ ] **Step 3:** Run: `npx vitest run --project unit tests/unit/cuentas/usuario.test.ts` → FAIL (el módulo no existe).

- [ ] **Step 4: Implementar** — `lib/cuentas/usuario.ts`:

```ts
/*
 * El nombre de usuario con el que cada persona entra (perfiles.usuario) y la dirección interna que
 * Supabase Auth exige por cuenta. Puro: sirve en el servidor, en los formularios y en los scripts.
 */

/** Las cuentas nuevas se crean en Auth con `<uuid>@` este dominio: `.invalid` nunca recibe correo (RFC 2606). */
export const DOMINIO_INTERNO = 'cuentas.molino.invalid'

/** Una dirección interna que no es de nadie: con ella el login de un usuario inexistente sigue el mismo camino. */
export const DIRECCION_INEXISTENTE = `nadie@${DOMINIO_INTERNO}`

export const LARGO_MINIMO_USUARIO = 3
export const LARGO_MAXIMO_USUARIO = 30

/** Letras sin tilde y números, separados por un solo punto, guion o guion bajo. Igual que el check de la base. */
export const FORMATO_USUARIO = /^[a-z0-9]+([._-][a-z0-9]+)*$/

/** Reservado para las cuentas de los scripts de demo (scripts/demo): los formularios lo rechazan. */
export const PREFIJO_DEMO = 'demo.'

/** La misma lista en la migración 20261005110000 (pg_temp.limpiar_usuario): si cambia una, cambia la otra. */
const SIN_MARCA: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' }

/** ' R.Flores ' → 'r.flores'; 'Muñoz' → 'munoz'. No valida: eso es `usuarioValido`. */
export function normalizarUsuario(texto: string): string {
  return texto
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (letra) => SIN_MARCA[letra])
}

export function usuarioValido(usuario: string): boolean {
  return usuario.length >= LARGO_MINIMO_USUARIO && usuario.length <= LARGO_MAXIMO_USUARIO && FORMATO_USUARIO.test(usuario)
}

/**
 * El usuario que la migración 20261005110000 le dio a una cuenta de la casa a partir de su correo: lo
 * de antes de la arroba, limpio. Así quien escribe su correo de siempre (o el teléfono lo rellena)
 * llega a su cuenta. No resuelve repetidos: a esos la migración les agregó `.2`, `.3`.
 */
export function usuarioDesdeCorreo(correo: string): string {
  const base = normalizarUsuario(correo.split('@')[0])
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/[._-]{2,}/g, (separadores) => separadores[0])
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, LARGO_MAXIMO_USUARIO)
    .replace(/[._-]+$/, '')
  if (base.length >= LARGO_MINIMO_USUARIO) return base
  return base ? `cuenta.${base}` : 'cuenta'
}

/** Lo que se escribió en el campo "Usuario" del login → el usuario a buscar. */
export function usuarioParaEntrar(texto: string): string {
  const limpio = normalizarUsuario(texto)
  return limpio.includes('@') ? usuarioDesdeCorreo(limpio) : limpio
}

export function direccionInterna(): string {
  return `${crypto.randomUUID()}@${DOMINIO_INTERNO}`
}

export function esDireccionInterna(correo: string | null | undefined): boolean {
  return correo?.endsWith(`@${DOMINIO_INTERNO}`) ?? false
}
```

- [ ] **Step 5:** Run: el mismo comando → PASS.

- [ ] **Step 6: Commit** — `feat(cuentas): nombre de usuario y direcciones internas de Auth`

---

### Task 2: `lib/cuentas/administracion.ts`

**Files:**
- Create: `lib/cuentas/administracion.ts`
- Test: `tests/unit/cuentas/administracion.test.ts`

- [ ] **Step 1: Prueba que falla**

```ts
import { describe, expect, it } from 'vitest'
import {
  nombreAdministracion,
  numeroDeAdministracion,
  siglasAdministracion,
  siguienteNumeroAdministracion,
  usuarioSugeridoAdministracion,
} from '@/lib/cuentas/administracion'

describe('nombre genérico de Administración', () => {
  it('nombre, siglas y usuario sugerido salen del mismo número', () => {
    expect(nombreAdministracion(3)).toBe('Administración 3')
    expect(siglasAdministracion(3)).toBe('A3')
    expect(usuarioSugeridoAdministracion(3)).toBe('admin.3')
  })

  it('reconoce el número de un nombre genérico, y nada más', () => {
    expect(numeroDeAdministracion('Administración 12')).toBe(12)
    expect(numeroDeAdministracion('Administración Prueba')).toBeNull()
    expect(numeroDeAdministracion('Ana Torres')).toBeNull()
    expect(numeroDeAdministracion('Administración 3 bis')).toBeNull()
  })

  it('el siguiente es uno más que el mayor en uso, sea de quien sea el nombre', () => {
    expect(siguienteNumeroAdministracion([])).toBe(1)
    expect(siguienteNumeroAdministracion(['Ana Torres', 'Administración Prueba'])).toBe(1)
    expect(siguienteNumeroAdministracion(['Administración 1', 'Juan', 'Administración 4'])).toBe(5)
  })
})
```

- [ ] **Step 2:** Run: `npx vitest run --project unit tests/unit/cuentas/administracion.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
/*
 * La casa no ve el nombre real de Administración: sus cuentas se llaman "Administración N" / "AN".
 * El número sale de los nombres que ya existen (de cualquier rol, activos o no): no hay contador.
 * Espejo en SQL: el relleno de la migración 20261005110000.
 */

export function nombreAdministracion(numero: number): string {
  return `Administración ${numero}`
}

export function siglasAdministracion(numero: number): string {
  return `A${numero}`
}

export function usuarioSugeridoAdministracion(numero: number): string {
  return `admin.${numero}`
}

/** 12 para 'Administración 12'; null si el nombre no es uno genérico. */
export function numeroDeAdministracion(nombre: string): number | null {
  const coincidencia = /^Administración (\d+)$/.exec(nombre)
  return coincidencia ? Number(coincidencia[1]) : null
}

/** 1 + el mayor número que lleve algún perfil (así no se repite uno que alguien todavía usa). */
export function siguienteNumeroAdministracion(nombres: readonly string[]): number {
  return Math.max(0, ...nombres.map((nombre) => numeroDeAdministracion(nombre) ?? 0)) + 1
}
```

- [ ] **Step 4:** Run: el mismo comando → PASS.

- [ ] **Step 5: Commit** — `feat(cuentas): nombre genérico de las cuentas de Administración`

---

### Task 3: migración A

**Files:**
- Create: `supabase/migrations/20261005110000_usuarios.sql`
- Modify: `lib/supabase/database.types.ts` (`perfiles`)

> **Tras la revisión del plan y la prueba en el banco**, la migración que quedó en el repo difiere de
> este bloque en tres puntos (manda el archivo `supabase/migrations/20261005110000_usuarios.sql`):
> 1. **Orden:** Administración real, Administración demo, casa demo, casa real (así las cuentas
>    reales de Administración se numeran desde 1 y las de demo se quedan con su `demo.…`).
> 2. **AVISAR:** se marca cuando el usuario no es, tal cual, lo de antes de la arroba (incluye
>    `cuenta.jp` y `juanalgo`).
> 3. **Prefijo `demo.`:** una cuenta real cuya parte local empiece así queda como `cuenta.demo.…`
>    (en `pg_temp.limpiar_usuario` y en `usuarioDesdeCorreo()`, con dos casos más en el fixture).
>
> También cambiaron respecto del plan: `tests/integration/cuentas.test.ts` no lee `perfiles.correo`;
> el e2e de cambio de rol a Administración se reescribió (pide confirmación y la cuenta cambia de
> nombre); `iniciarSesion` responde con un fallo si falta la llave secreta, en vez de romper.

- [ ] **Step 1: Migración**

```sql
-- =========================================================
-- Cuentas: se entra con un nombre de usuario, no con el correo.
--
-- 1. perfiles.usuario: único, en minúsculas, 3 a 30 caracteres.
-- 2. Las cuentas que ya existen reciben su usuario:
--      - demo (@demo.test): demo.<lo de antes de la arroba>
--      - Administración:    admin.N, y pasan a llamarse "Administración N" / "AN"
--                           (la casa no ve el nombre real de Administración)
--      - la casa:           lo de antes de la arroba de su correo, limpio
--    Repetidos: al más antiguo le queda el limpio; a los siguientes, .2, .3…
-- 3. perfiles.correo deja de ser obligatorio: el código nuevo ya no lo escribe. La columna se
--    borra en una migración posterior, cuando el login nuevo esté comprobado.
--
-- Aplicar JUSTO ANTES de desplegar el código que entra por usuario. Al final devuelve la lista de
-- usuarios para repartir.
-- =========================================================

alter table public.perfiles add column usuario text;

-- La limpieza: espejo de usuarioDesdeCorreo() en lib/cuentas/usuario.ts (casos compartidos en
-- tests/fixtures/casos-usuario.json). Si cambia una, cambia la otra.
create function pg_temp.limpiar_usuario(p_correo text)
returns text
language sql
immutable
as $$
  with paso1 as (
    select translate(lower(split_part(p_correo, '@', 1)), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun') as t
  ), paso2 as (
    select regexp_replace(t, '[^a-z0-9._-]', '', 'g') as t from paso1
  ), paso3 as (
    select regexp_replace(regexp_replace(t, '([._-])[._-]+', '\1', 'g'), '^[._-]+|[._-]+$', '', 'g') as t from paso2
  ), paso4 as (
    select regexp_replace(left(t, 30), '[._-]+$', '') as t from paso3
  )
  select case when length(t) >= 3 then t when t = '' then 'cuenta' else 'cuenta.' || t end from paso4
$$;

do $$
declare
  r record;
  v_base text;
  v_usuario text;
  v_n integer;
  v_admin integer := 0;
begin
  -- Demo primero (no le quitan el usuario a una cuenta real), después Administración, después la casa;
  -- dentro de cada grupo, por antigüedad.
  for r in
    select p.id, p.correo, p.rol
    from public.perfiles p
    order by (p.correo like '%@demo.test') desc, (p.rol = 'administracion') desc, p.creado_en, p.id
  loop
    if r.rol = 'administracion' then
      v_admin := v_admin + 1;
      update public.perfiles
      set nombre = 'Administración ' || v_admin, siglas = 'A' || v_admin
      where id = r.id;
    end if;

    if r.correo like '%@demo.test' then
      v_base := 'demo.' || pg_temp.limpiar_usuario(r.correo);
    elsif r.rol = 'administracion' then
      v_base := 'admin.' || v_admin;
    else
      v_base := pg_temp.limpiar_usuario(r.correo);
    end if;
    -- Prefijos y sufijos cuentan dentro de los 30: si no entran, se recorta la base.
    v_base := regexp_replace(left(v_base, 30), '[._-]+$', '');

    v_usuario := v_base;
    v_n := 1;
    while exists (select 1 from public.perfiles p where p.usuario = v_usuario) loop
      v_n := v_n + 1;
      v_usuario := regexp_replace(left(v_base, 30 - length('.' || v_n)), '[._-]+$', '') || '.' || v_n;
    end loop;

    update public.perfiles set usuario = v_usuario where id = r.id;
  end loop;
end $$;

alter table public.perfiles
  alter column usuario set not null,
  add constraint perfiles_usuario_unico unique (usuario),
  add constraint perfiles_usuario_formato
    check (usuario ~ '^[a-z0-9]+([._-][a-z0-9]+)*$' and length(usuario) between 3 and 30),
  alter column correo drop not null;

comment on column public.perfiles.usuario is
  'Con lo que la persona entra. Lo pone y lo cambia el Director. Normalizado: minúsculas, sin tildes.';

-- La lista para repartir: a quién hay que decirle su usuario (los que no lo deducen de su correo).
select
  p.correo as "correo de antes",
  p.rol,
  p.usuario,
  case
    when p.rol = 'administracion' or p.usuario is distinct from pg_temp.limpiar_usuario(p.correo) then 'AVISAR'
    else ''
  end as avisar
from public.perfiles p
order by p.rol, p.creado_en;
```

- [ ] **Step 2: Banco SQL local** (scratchpad, no en el repo; `banco/montar.mjs`): montar con `migraciones({ hasta: '20261005100000_eventos_cocina_tipo.sql' })`, sembrar perfiles con correos y después aplicar a mano `leerMigracion('20261005110000_usuarios.sql')`. Comprobar:
  - cada caso de `tests/fixtures/casos-usuario.json`: `pg_temp.limpiar_usuario(correo)` da lo esperado (para llamarla hace falta crearla en esa sesión: extraer el `create function pg_temp…` del archivo o correr los casos en la misma conexión que aplicó la migración);
  - dos cuentas de la casa con la misma parte local → la más antigua queda con el limpio y la otra con `.2`;
  - Administración → `admin.N`, `Administración N`, `AN` por antigüedad; una de demo de Administración → `demo.administracion` con nombre genérico;
  - `usuario` queda `not null` y único; insertar `R.Flores` o `ab` falla por el check (23514); insertar un repetido, 23505;
  - `correo` admite `null`;
  - como `authenticated` activo, `select usuario from perfiles` funciona (el `grant select` es de tabla);
  - la consulta final marca `AVISAR` en Administración, el `.2` y un `cuenta.jp`.

- [ ] **Step 3: Tipos** — en `lib/supabase/database.types.ts`, tabla `perfiles`: `Row` gana `usuario: string` y `correo` pasa a `string | null`; `Insert` gana `usuario: string` y `correo?: string | null`; `Update` gana `usuario?: string` y `correo?: string | null`. (Orden alfabético de claves.)

- [ ] **Step 4:** `npm run typecheck` → falla donde se arma un `Perfil` sin `usuario` o se usa `correo` como `string`: se arregla en las tareas que siguen. No commitear rojo: este commit va junto con el de la Task 4.

---

### Task 4: crear cuentas con usuario

**Files:**
- Create: `lib/cuentas/direccion-de-acceso.ts`
- Modify: `lib/cuentas/crear-cuenta.ts`, `lib/configuraciones/errores.ts`, `tipos.ts`, `consultas.ts`
- Modify: `tests/soporte/supabase-falso.ts` (`perfilDePrueba`), `tests/unit/mensajes/acciones.test.ts` y cualquier otro literal de `Perfil` (gana `usuario`)
- Test: `tests/unit/configuraciones/errores.test.ts`

- [ ] **Step 1: `errores.ts`** — `MENSAJE_CORREO_REPETIDO` pasa a:

```ts
export const MENSAJE_USUARIO_REPETIDO = 'Ya existe una cuenta con ese usuario.'
```

`mensajeErrorPerfil`: `23505` → `MENSAJE_USUARIO_REPETIDO`; el comentario dice "unicidad de `perfiles.usuario`". Ajustar `tests/unit/configuraciones/errores.test.ts` al nombre nuevo.

- [ ] **Step 2: `tipos.ts` y `consultas.ts`**

```ts
export type Cuenta = Pick<
  Tabla<'perfiles'>,
  'id' | 'nombre' | 'siglas' | 'usuario' | 'rol' | 'activo' | 'debe_cambiar_contrasena'
>

/** Datos de "Mi cuenta" ya normalizados, para que el formulario muestre lo que quedó guardado. */
export type DatosMiCuenta = Pick<Tabla<'perfiles'>, 'nombre' | 'siglas'>
```

`listarCuentas`: `.select('id, nombre, siglas, usuario, rol, activo, debe_cambiar_contrasena')`; el comentario: "`listarPerfiles` (Fase 0) no incluye el usuario ni la marca de contraseña temporal."

- [ ] **Step 3: `crear-cuenta.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { MENSAJE_USUARIO_REPETIDO } from '@/lib/configuraciones/errores'
import { direccionInterna, normalizarUsuario } from '@/lib/cuentas/usuario'
import type { Rol } from '@/lib/perfiles/roles'
import type { Database } from '@/lib/supabase/database.types'

export type DatosCuenta = {
  nombre: string
  siglas: string
  /** Con lo que la persona va a entrar. Quien llama ya lo validó (formato y que no esté repetido). */
  usuario: string
  rol: Rol
  contrasena: string
  debeCambiarContrasena: boolean
}

export type ResultadoCrearCuenta = { ok: true; id: string } | { ok: false; error: string }

/**
 * Crea usuario de Auth (confirmado) + perfil. Si el perfil falla, borra el usuario (spec §4).
 * Auth exige un correo por cuenta: recibe una dirección interna que nadie ve ni escribe; la persona
 * entra con `usuario` (lib/cuentas/direccion-de-acceso.ts).
 */
export async function crearCuenta(admin: SupabaseClient<Database>, datos: DatosCuenta): Promise<ResultadoCrearCuenta> {
  const { data, error } = await admin.auth.admin.createUser({
    email: direccionInterna(),
    password: datos.contrasena,
    email_confirm: true,
  })
  if (error || !data.user) {
    // Se registra el error original (logs de Vercel o consola del script); al usuario le llega un mensaje simple.
    console.error('crearCuenta: Auth no creó el usuario', error)
    return { ok: false, error: 'No se pudo crear la cuenta.' }
  }

  const { error: errorPerfil } = await admin.from('perfiles').insert({
    id: data.user.id,
    nombre: datos.nombre.trim(),
    siglas: datos.siglas.trim().toUpperCase(),
    usuario: normalizarUsuario(datos.usuario),
    rol: datos.rol,
    debe_cambiar_contrasena: datos.debeCambiarContrasena,
  })
  if (errorPerfil) {
    const repetido = errorPerfil.code === '23505'
    if (!repetido) console.error('crearCuenta: no se pudo insertar el perfil', errorPerfil)
    const { error: errorBorrado } = await admin.auth.admin.deleteUser(data.user.id)
    if (errorBorrado) {
      // Queda un usuario de Auth sin perfil: hay que borrarlo a mano desde el panel de Supabase.
      console.error(`crearCuenta: no se pudo borrar el usuario de Auth sin perfil (id ${data.user.id})`, errorBorrado)
    }
    return { ok: false, error: repetido ? MENSAJE_USUARIO_REPETIDO : 'No se pudo crear el perfil de la cuenta.' }
  }

  return { ok: true, id: data.user.id }
}
```

- [ ] **Step 4: `direccion-de-acceso.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { DIRECCION_INEXISTENTE } from '@/lib/cuentas/usuario'
import type { Database } from '@/lib/supabase/database.types'

export type DireccionDeAcceso = { ok: true; correo: string } | { ok: false }

/**
 * La dirección con la que Supabase Auth conoce a la cuenta de `usuario` (ya normalizado). Necesita
 * la llave secreta: nadie más puede leer direcciones de Auth.
 *
 * Si el usuario no existe devuelve una dirección que no es de nadie, no un error: así quien llama
 * intenta entrar igual y responde lo mismo que con una contraseña equivocada, sin revelar qué
 * usuarios existen. `ok: false` es solo "no se pudo consultar".
 */
export async function direccionDeAcceso(admin: SupabaseClient<Database>, usuario: string): Promise<DireccionDeAcceso> {
  const { data: perfil, error } = await admin.from('perfiles').select('id').eq('usuario', usuario).maybeSingle()
  if (error) {
    console.error('direccionDeAcceso: no se pudo buscar el usuario', error)
    return { ok: false }
  }
  if (!perfil) return { ok: true, correo: DIRECCION_INEXISTENTE }

  const { data, error: errorAuth } = await admin.auth.admin.getUserById(perfil.id)
  if (errorAuth) {
    // Un perfil sin cuenta de Auth no debería existir (on delete cascade); cualquier otro error es de consulta.
    if (errorAuth.status === 404) return { ok: true, correo: DIRECCION_INEXISTENTE }
    console.error(`direccionDeAcceso: Auth no devolvió la cuenta (usuario ${perfil.id})`, errorAuth)
    return { ok: false }
  }
  return { ok: true, correo: data.user?.email ?? DIRECCION_INEXISTENTE }
}
```

- [ ] **Step 5: Literales de `Perfil` en pruebas** — `perfilDePrueba` (`tests/soporte/supabase-falso.ts`) gana `usuario: \`${rol}-${id.slice(0, 4)}\`` y su `correo` pasa a `null`; lo mismo en `DIRECTOR` de `tests/unit/configuraciones/acciones.test.ts` (`usuario: 'director'`, `correo: null`) y en el perfil de `tests/unit/mensajes/acciones.test.ts`. `npm run typecheck` dice si queda alguno.

- [ ] **Step 6:** `npm run typecheck` sigue rojo en `app/(app)/configuraciones`, `app/login` y `scripts`: son las Tasks 5–8. Hacerlas antes de commitear, o commitear por tarea aceptando el rojo intermedio (el PR se mergea con squash). Mensajes sugeridos: `feat(cuentas): migración de usuarios`, `feat(cuentas): las cuentas se crean con usuario y dirección interna`.

---

### Task 5: entrar con usuario

**Files:**
- Modify: `lib/validacion/auth.ts`, `app/login/acciones.ts`, `app/login/formulario-login.tsx`
- Test: `tests/unit/validacion/auth.test.ts`, `tests/unit/login/acciones.test.ts` (**nuevo**)

- [ ] **Step 1: `esquemaLogin`** — pruebas en `tests/unit/validacion/auth.test.ts` (reemplazan las de `correo`):

```ts
  it('el usuario llega sin espacios en los extremos; normalizarlo es del login', () => {
    const r = esquemaLogin.safeParse({ usuario: '  R.Flores ', contrasena: 'x' })
    expect(r.success && r.data.usuario).toBe('R.Flores')
  })

  it('no toca la contraseña', () => {
    const r = esquemaLogin.safeParse({ usuario: 'r.flores', contrasena: '  Clave con espacios ' })
    expect(r.success && r.data.contrasena).toBe('  Clave con espacios ')
  })

  it('pide el usuario y la contraseña', () => {
    const r = esquemaLogin.safeParse({ usuario: '   ', contrasena: '' })
    expect(r.success).toBe(false)
    expect(camposConError(r.error!)).toEqual({ usuario: 'Ingresá tu usuario.', contrasena: 'Ingresá tu contraseña.' })
  })
```

Implementación:

```ts
export const esquemaLogin = z.object({
  // Sin formato: quien entra puede escribir su correo de siempre (lib/cuentas/usuario.ts lo traduce).
  usuario: z.string().trim().min(1, 'Ingresá tu usuario.').max(255, 'Ingresá tu usuario.'),
  contrasena: z.string().min(1, 'Ingresá tu contraseña.'),
})
```

- [ ] **Step 2: Prueba de la acción** — `tests/unit/login/acciones.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { iniciarSesion } from '@/app/login/acciones'
import { DIRECCION_INEXISTENTE } from '@/lib/cuentas/usuario'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearClienteServidor } from '@/lib/supabase/servidor'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((ruta: string) => {
    throw new Error(`REDIRECT ${ruta}`)
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ crearClienteAdmin: vi.fn() }))
vi.mock('@/lib/supabase/servidor', () => ({ crearClienteServidor: vi.fn() }))

const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

type Respuesta = { data: unknown; error: unknown }

/** El cliente con la llave secreta: busca el perfil por usuario y pide la cuenta a Auth. */
function admin(perfil: Respuesta, cuenta: Respuesta = { data: { user: { id: ID, email: 'guardada@en-auth.test' } }, error: null }) {
  const eq = vi.fn(() => ({ maybeSingle: async () => perfil }))
  const cliente = {
    from: vi.fn(() => ({ select: () => ({ eq }) })),
    auth: { admin: { getUserById: vi.fn(async () => cuenta) } },
  }
  vi.mocked(crearClienteAdmin).mockReturnValue(cliente as never)
  return { cliente, eq }
}

/** El cliente de la sesión: entra con la dirección y lee el perfil. */
function servidor(entrada: Respuesta, perfil: Respuesta = { data: { activo: true, debe_cambiar_contrasena: false }, error: null }) {
  const cliente = {
    auth: { signInWithPassword: vi.fn(async () => entrada), signOut: vi.fn(async () => ({ error: null })) },
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => perfil }) }) })),
  }
  vi.mocked(crearClienteServidor).mockResolvedValue(cliente as never)
  return cliente
}

function formulario(usuario: string, contrasena = 'clave-de-prueba') {
  const datos = new FormData()
  datos.set('usuario', usuario)
  datos.set('contrasena', contrasena)
  return datos
}

const ENTRO: Respuesta = { data: { user: { id: ID } }, error: null }
const RECHAZO: Respuesta = { data: { user: null }, error: { code: 'invalid_credentials' } }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('iniciarSesion: se entra con el usuario', () => {
  it('busca el usuario normalizado y entra con la dirección que guarda Auth', async () => {
    const { eq } = admin({ data: { id: ID }, error: null })
    const sesion = servidor(ENTRO)
    await expect(iniciarSesion(null, formulario('  R.Flores '))).rejects.toThrow('REDIRECT /comidas/semana')
    expect(eq).toHaveBeenCalledWith('usuario', 'r.flores')
    expect(sesion.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'guardada@en-auth.test', password: 'clave-de-prueba' })
  })

  it('quien escribe su correo de siempre llega al usuario que le tocó', async () => {
    const { eq } = admin({ data: { id: ID }, error: null })
    servidor(ENTRO)
    await expect(iniciarSesion(null, formulario('RFlores@Gmail.com'))).rejects.toThrow('REDIRECT')
    expect(eq).toHaveBeenCalledWith('usuario', 'rflores')
  })

  it('un usuario que no existe sigue el mismo camino y da el mismo mensaje que una contraseña mala', async () => {
    const { cliente } = admin({ data: null, error: null })
    const sesion = servidor(RECHAZO)
    expect(await iniciarSesion(null, formulario('nadie'))).toEqual({ ok: false, error: 'Usuario o contraseña incorrectos.' })
    expect(cliente.auth.admin.getUserById).not.toHaveBeenCalled()
    expect(sesion.auth.signInWithPassword).toHaveBeenCalledWith({ email: DIRECCION_INEXISTENTE, password: 'clave-de-prueba' })

    admin({ data: { id: ID }, error: null })
    servidor(RECHAZO)
    expect(await iniciarSesion(null, formulario('r.flores'))).toEqual({ ok: false, error: 'Usuario o contraseña incorrectos.' })
  })

  it('si no se pudo consultar, no dice que el usuario o la contraseña están mal', async () => {
    admin({ data: null, error: { code: '08006' } })
    const sesion = servidor(ENTRO)
    expect(await iniciarSesion(null, formulario('r.flores'))).toEqual({
      ok: false,
      error: 'No se pudo iniciar sesión. Intentá de nuevo.',
    })
    expect(sesion.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('una cuenta desactivada lo dice', async () => {
    admin({ data: { id: ID }, error: null })
    servidor({ data: { user: null }, error: { code: 'user_banned' } })
    expect(await iniciarSesion(null, formulario('r.flores'))).toEqual({
      ok: false,
      error: 'Tu cuenta está desactivada. Hablá con el Director.',
    })
  })

  it('con contraseña temporal va a cambiarla', async () => {
    admin({ data: { id: ID }, error: null })
    servidor(ENTRO, { data: { activo: true, debe_cambiar_contrasena: true }, error: null })
    await expect(iniciarSesion(null, formulario('r.flores'))).rejects.toThrow('REDIRECT /cambiar-contrasena')
  })

  it('sin usuario no llega a la base', async () => {
    expect(await iniciarSesion(null, formulario('   '))).toMatchObject({ ok: false, campos: { usuario: 'Ingresá tu usuario.' } })
    expect(crearClienteAdmin).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3:** Run: `npx vitest run --project unit tests/unit/login tests/unit/validacion/auth.test.ts` → FAIL.

- [ ] **Step 4: `app/login/acciones.ts`** — el principio de `iniciarSesion` pasa a:

```ts
  const entrada = esquemaLogin.safeParse({
    usuario: formData.get('usuario'),
    contrasena: formData.get('contrasena'),
  })
  if (!entrada.success) return fallo('Revisá los datos.', camposConError(entrada.error))

  // Auth conoce cada cuenta por una dirección que nadie escribe: se busca con la llave secreta.
  const direccion = await direccionDeAcceso(crearClienteAdmin(), usuarioParaEntrar(entrada.data.usuario))
  if (!direccion.ok) return fallo('No se pudo iniciar sesión. Intentá de nuevo.')

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: direccion.correo,
    password: entrada.data.contrasena,
  })
  if (error || !data.user) {
    if (error?.code === 'user_banned') return fallo('Tu cuenta está desactivada. Hablá con el Director.')
    return fallo('Usuario o contraseña incorrectos.')
  }
```

Imports nuevos: `direccionDeAcceso` (`@/lib/cuentas/direccion-de-acceso`), `usuarioParaEntrar` (`@/lib/cuentas/usuario`), `crearClienteAdmin` (`@/lib/supabase/admin`). El resto de la función no cambia.

- [ ] **Step 5: `formulario-login.tsx`** — estado `usuario`; el campo:

```tsx
      <div className="field">
        <label htmlFor="usuario">Usuario</label>
        <input
          id="usuario"
          name="usuario"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
        />
        {campos?.usuario && <div className="campo-error">{campos.usuario}</div>}
      </div>
```

El comentario del estado: "…tras un error la persona perdería el usuario que ya escribió."

- [ ] **Step 6:** Run: el comando del Step 3 → PASS.

- [ ] **Step 7: Commit** — `feat(login): se entra con el nombre de usuario`

---

### Task 6: validación y acciones de Ajustes

**Files:**
- Modify: `lib/validacion/configuraciones.ts`, `app/(app)/configuraciones/acciones.ts`
- Test: `tests/unit/configuraciones/validacion.test.ts`, `tests/unit/configuraciones/acciones.test.ts`

- [ ] **Step 1: Esquemas** — en `lib/validacion/configuraciones.ts` desaparece `correo`; se agregan:

```ts
import { FORMATO_USUARIO, LARGO_MAXIMO_USUARIO, LARGO_MINIMO_USUARIO, normalizarUsuario, PREFIJO_DEMO } from '@/lib/cuentas/usuario'

const MENSAJE_FORMATO_USUARIO = 'Usá solo letras sin tilde, números, punto, guion o guion bajo. Ejemplo: r.flores'

/** El usuario como lo escribe el Director: se normaliza y después se valida (mismo check que la base). */
const usuario = z
  .string()
  .transform(normalizarUsuario)
  .pipe(
    z
      .string()
      .min(LARGO_MINIMO_USUARIO, `El usuario debe tener al menos ${LARGO_MINIMO_USUARIO} caracteres.`)
      .max(LARGO_MAXIMO_USUARIO, `El usuario puede tener hasta ${LARGO_MAXIMO_USUARIO} caracteres.`)
      .regex(FORMATO_USUARIO, MENSAJE_FORMATO_USUARIO)
      // Solo en los formularios: los scripts de demo sí crean cuentas `demo.…`.
      .refine((valor) => !valor.startsWith(PREFIJO_DEMO), 'Ese usuario está reservado. Elegí otro.'),
  )

/** Nombre y siglas de la propia cuenta (spec §4). El usuario lo cambia el Director. */
export const esquemaPerfilPropio = z.object({ nombre, siglas })

/**
 * Cuenta nueva. Administración no lleva nombre ni siglas: los pone el servidor ("Administración N").
 */
export const esquemaNuevaCuenta = z.discriminatedUnion(
  'rol',
  [
    z.object({ rol: z.literal('administracion'), usuario, contrasena: contrasenaTemporal }),
    z.object({ rol: z.enum(['director', 'residente']), nombre, siglas, usuario, contrasena: contrasenaTemporal }),
  ],
  { error: 'Elegí un rol.' },
)

export const esquemaCambioUsuario = z.object({ id: idCuenta, usuario })
```

Pruebas en `tests/unit/configuraciones/validacion.test.ts` (reemplazan las que mencionan `correo`; conservar las demás):

```ts
describe('esquemaPerfilPropio', () => {
  it('normaliza nombre y siglas; el usuario no se cambia desde Mi cuenta', () => {
    const r = esquemaPerfilPropio.safeParse({ nombre: '  Juan Pérez ', siglas: ' jp ', usuario: 'otro' })
    expect(r.success && r.data).toEqual({ nombre: 'Juan Pérez', siglas: 'JP' })
  })
})

describe('esquemaNuevaCuenta', () => {
  const datos = { nombre: 'Ana Torres', siglas: 'at', usuario: ' A.Torres ', rol: 'residente', contrasena: 'k7hm-pq3x-wn9d' }

  it('una cuenta de la casa: nombre, siglas y usuario normalizados', () => {
    const r = esquemaNuevaCuenta.safeParse(datos)
    expect(r.success && r.data).toEqual({ ...datos, siglas: 'AT', usuario: 'a.torres' })
  })

  it('una cuenta de Administración no lleva nombre ni siglas (los pone el servidor)', () => {
    const r = esquemaNuevaCuenta.safeParse({ rol: 'administracion', usuario: 'admin.3', contrasena: datos.contrasena, nombre: 'Ana' })
    expect(r.success && r.data).toEqual({ rol: 'administracion', usuario: 'admin.3', contrasena: datos.contrasena })
  })

  it('a una cuenta de la casa le pide nombre y siglas', () => {
    expect(campos(esquemaNuevaCuenta.safeParse({ ...datos, nombre: '', siglas: '' }))).toMatchObject({
      nombre: 'Ingresá el nombre.',
      siglas: 'Ingresá las siglas.',
    })
  })

  it.each([
    ['ab', 'El usuario debe tener al menos 3 caracteres.'],
    ['a'.repeat(31), 'El usuario puede tener hasta 30 caracteres.'],
    ['r flores', 'Usá solo letras sin tilde, números, punto, guion o guion bajo. Ejemplo: r.flores'],
    ['r..flores', 'Usá solo letras sin tilde, números, punto, guion o guion bajo. Ejemplo: r.flores'],
    ['rflores@gmail.com', 'Usá solo letras sin tilde, números, punto, guion o guion bajo. Ejemplo: r.flores'],
    ['demo.director', 'Ese usuario está reservado. Elegí otro.'],
  ])('usuario %s: %s', (usuario, mensaje) => {
    expect(campos(esquemaNuevaCuenta.safeParse({ ...datos, usuario }))).toEqual({ usuario: mensaje })
  })

  it('sin rol, lo pide', () => {
    expect(campos(esquemaNuevaCuenta.safeParse({ ...datos, rol: 'jefe' }))).toEqual({ rol: 'Elegí un rol.' })
  })
})

describe('esquemaCambioUsuario', () => {
  it('normaliza el usuario nuevo', () => {
    const id = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
    expect(esquemaCambioUsuario.safeParse({ id, usuario: ' R.Muñoz ' })).toMatchObject({ success: true, data: { id, usuario: 'r.munoz' } })
  })
})
```

(`campos` es el ayudante que ya usa ese archivo. Si zod 4 pone el error del discriminador en otro `path`, ajustar la unión —por ejemplo `rol` validado aparte con `z.enum(ROLES, { error: 'Elegí un rol.' })` antes de la unión— hasta que la prueba "sin rol, lo pide" pase tal cual.)

- [ ] **Step 2:** Run: `npx vitest run --project unit tests/unit/configuraciones/validacion.test.ts` → FAIL; implementar; → PASS.

- [ ] **Step 3: Acciones — pruebas que fallan.** En `tests/unit/configuraciones/acciones.test.ts`:
  - Imports: `MENSAJE_USUARIO_REPETIDO`, `cambiarUsuarioCuenta`.
  - `clienteFalso`: el objeto `q` gana `insert` (registra los valores en un arreglo `inserciones` que devuelve junto a `actualizaciones`, y responde con la siguiente `escritura`), `like: () => q` e `in: () => q`; `auth.admin` gana `deleteUser: vi.fn(async () => ({ data: {}, error: null }))`.
  - Reemplazar `describe('crearNuevaCuenta', …)` y `describe('Mi cuenta', …)` (conservar la prueba de `cambiarMiContrasena` tal cual) y agregar:

```ts
describe('crearNuevaCuenta', () => {
  const casa = { nombre: 'Ana', siglas: 'at', usuario: ' A.Torres ', rol: 'residente', contrasena: CONTRASENA }

  it('crea la cuenta con el usuario normalizado y una dirección interna, nunca un correo', async () => {
    const falso = usarAdmin(clienteFalso())
    const r = await crearNuevaCuenta(null, formulario(casa))
    expect(r).toEqual({ ok: true, data: { id: ID_OTRA, nombre: 'Ana', usuario: 'a.torres' } })
    expect(falso.cliente.auth.admin.createUser).toHaveBeenCalledWith({
      email: expect.stringMatching(/^[0-9a-f-]{36}@cuentas\.molino\.invalid$/),
      password: CONTRASENA,
      email_confirm: true,
    })
    expect(falso.inserciones).toEqual([
      { id: ID_OTRA, nombre: 'Ana', siglas: 'AT', usuario: 'a.torres', rol: 'residente', debe_cambiar_contrasena: true },
    ])
  })

  it('un usuario que ya existe se muestra en el campo usuario, sin tocar Auth', async () => {
    const falso = usarAdmin(clienteFalso({ lecturas: [{ data: { id: ID_DIRECTOR }, error: null }] }))
    const r = await crearNuevaCuenta(null, formulario(casa))
    expect(r).toEqual({ ok: false, error: 'Revisá los datos.', campos: { usuario: MENSAJE_USUARIO_REPETIDO } })
    expect(falso.cliente.auth.admin.createUser).not.toHaveBeenCalled()
  })

  it('si dos personas lo crean a la vez, la base lo rechaza y también va al campo', async () => {
    usarAdmin(clienteFalso({ escrituras: [{ data: null, error: { code: '23505' } }] }))
    const r = await crearNuevaCuenta(null, formulario(casa))
    expect(r).toEqual({ ok: false, error: 'Revisá los datos.', campos: { usuario: MENSAJE_USUARIO_REPETIDO } })
  })

  it('una cuenta de Administración recibe el nombre genérico que sigue, no uno escrito', async () => {
    const falso = usarAdmin(
      clienteFalso({
        // 1.ª lectura: ¿existe el usuario? 2.ª: los nombres genéricos en uso.
        lecturas: [LECTURA_VACIA, { data: [{ nombre: 'Administración 1' }, { nombre: 'Administración 4' }], error: null }],
      }),
    )
    const r = await crearNuevaCuenta(
      null,
      formulario({ rol: 'administracion', usuario: 'admin.5', contrasena: CONTRASENA, nombre: 'María Real', siglas: 'MR' }),
    )
    expect(r).toEqual({ ok: true, data: { id: ID_OTRA, nombre: 'Administración 5', usuario: 'admin.5' } })
    expect(falso.inserciones[0]).toMatchObject({ nombre: 'Administración 5', siglas: 'A5', usuario: 'admin.5', rol: 'administracion' })
    expect(JSON.stringify(falso.inserciones)).not.toContain('María')
  })
})

describe('Mi cuenta', () => {
  it('guarda nombre y siglas normalizados; ni correo ni usuario', async () => {
    const falso = usarAdmin(clienteFalso())
    const r = await guardarMiCuenta(null, formulario({ nombre: '  Directora Renombrada ', siglas: ' dr ', usuario: 'otro' }))
    expect(r).toEqual({ ok: true, data: { nombre: 'Directora Renombrada', siglas: 'DR' } })
    expect(falso.actualizaciones).toEqual([{ nombre: 'Directora Renombrada', siglas: 'DR' }])
    expect(falso.cliente.auth.admin.updateUserById).not.toHaveBeenCalled()
  })

  it('Administración no cambia su nombre: lo pone la app', async () => {
    vi.mocked(perfilParaAccion).mockResolvedValue({
      ok: true,
      perfil: { ...DIRECTOR, id: ID_OTRA, rol: 'administracion', nombre: 'Administración 1', siglas: 'A1' },
    })
    const falso = usarAdmin(clienteFalso())
    const r = await guardarMiCuenta(null, formulario({ nombre: 'María Real', siglas: 'MR' }))
    expect(r).toEqual({ ok: false, error: 'En Administración el nombre lo pone la app.' })
    expect(falso.actualizaciones).toEqual([])
  })
})

describe('cambiarUsuarioCuenta', () => {
  it('el Director cambia el usuario de una cuenta (también el propio), normalizado', async () => {
    const falso = usarAdmin(clienteFalso())
    expect(await cambiarUsuarioCuenta(null, formulario({ id: ID_OTRA, usuario: ' R.Muñoz ' }))).toEqual({
      ok: true,
      data: { usuario: 'r.munoz' },
    })
    expect(falso.actualizaciones).toEqual([{ usuario: 'r.munoz' }])
    expect(await cambiarUsuarioCuenta(null, formulario({ id: ID_DIRECTOR, usuario: 'directora' }))).toMatchObject({ ok: true })
    // Auth no se toca: la dirección interna no depende del usuario.
    expect(falso.cliente.auth.admin.updateUserById).not.toHaveBeenCalled()
  })

  it('un usuario repetido va al campo', async () => {
    usarAdmin(clienteFalso({ escrituras: [{ data: null, error: { code: '23505' } }] }))
    expect(await cambiarUsuarioCuenta(null, formulario({ id: ID_OTRA, usuario: 'r.flores' }))).toEqual({
      ok: false,
      error: 'Revisá los datos.',
      campos: { usuario: MENSAJE_USUARIO_REPETIDO },
    })
  })

  it('una cuenta que no existe lo dice', async () => {
    usarAdmin(clienteFalso({ escrituras: [{ data: [], error: null }] }))
    expect(await cambiarUsuarioCuenta(null, formulario({ id: ID_OTRA, usuario: 'r.flores' }))).toEqual({
      ok: false,
      error: 'La cuenta no existe.',
    })
  })

  it('solo el Director', async () => {
    vi.mocked(perfilParaAccion).mockResolvedValue({ ok: false, error: 'No tenés permiso para hacer esto.' })
    expect(await cambiarUsuarioCuenta(null, formulario({ id: ID_OTRA, usuario: 'r.flores' }))).toMatchObject({ ok: false })
    expect(crearClienteAdmin).not.toHaveBeenCalled()
  })
})

describe('cambiarRolCuenta hacia Administración', () => {
  it('la cuenta toma el nombre genérico que sigue', async () => {
    const falso = usarAdmin(
      clienteFalso({
        // 1.ª lectura: el rol que tiene hoy. 2.ª: los nombres genéricos en uso.
        lecturas: [{ data: { rol: 'residente' }, error: null }, { data: [{ nombre: 'Administración 2' }], error: null }],
      }),
    )
    expect(await cambiarRolCuenta({ id: ID_OTRA, rol: 'administracion' })).toEqual({ ok: true, data: null })
    expect(falso.actualizaciones).toEqual([{ rol: 'administracion', nombre: 'Administración 3', siglas: 'A3' }])
  })

  it('si ya era de Administración, conserva su nombre', async () => {
    const falso = usarAdmin(clienteFalso({ lecturas: [{ data: { rol: 'administracion' }, error: null }] }))
    expect(await cambiarRolCuenta({ id: ID_OTRA, rol: 'administracion' })).toEqual({ ok: true, data: null })
    expect(falso.actualizaciones).toEqual([{ rol: 'administracion' }])
  })

  it('a otro rol no toca el nombre', async () => {
    const falso = usarAdmin(clienteFalso())
    expect(await cambiarRolCuenta({ id: ID_OTRA, rol: 'residente' })).toEqual({ ok: true, data: null })
    expect(falso.actualizaciones).toEqual([{ rol: 'residente' }])
  })
})
```

Las pruebas que ya existían de `cambiarRolCuenta` siguen valiendo (usan `rol: 'residente'` / `'director'`); si alguna cuenta lecturas, tener en cuenta que el rol `administracion` hace dos lecturas antes de escribir.

- [ ] **Step 4: Implementar en `acciones.ts`**

`guardarMiCuenta` queda:

```ts
export async function guardarMiCuenta(
  _previo: Resultado<DatosMiCuenta> | null,
  formData: FormData,
): Promise<Resultado<DatosMiCuenta>> {
  const acceso = await perfilParaAccion()
  if (!acceso.ok) return acceso
  const { perfil } = acceso
  // La casa no ve el nombre real de Administración: el suyo es genérico y no se edita.
  if (perfil.rol === 'administracion') return fallo('En Administración el nombre lo pone la app.')

  const entrada = esquemaPerfilPropio.safeParse({ nombre: formData.get('nombre'), siglas: formData.get('siglas') })
  if (!entrada.success) return fallo(MENSAJE_REVISAR, camposConError(entrada.error))
  const { nombre, siglas } = entrada.data

  const { error } = await crearClienteAdmin().from('perfiles').update({ nombre, siglas }).eq('id', perfil.id)
  if (error) {
    console.error(`guardarMiCuenta: no se pudo actualizar el perfil (usuario ${perfil.id})`, error)
    return fallo('No se pudieron guardar los cambios. Intentá de nuevo.')
  }

  revalidatePath('/configuraciones')
  revalidatePath('/', 'layout') // la barra lateral muestra nombre y siglas
  return exito({ nombre, siglas })
}
```

Un ayudante privado en el mismo archivo:

```ts
/** Nombre y siglas genéricos para una cuenta que entra a Administración: el número que sigue. */
async function identidadDeAdministracion(admin: ReturnType<typeof crearClienteAdmin>) {
  const { data, error } = await admin.from('perfiles').select('nombre').like('nombre', 'Administración %')
  if (error) return { error }
  const numero = siguienteNumeroAdministracion(data.map((fila) => fila.nombre))
  return { nombre: nombreAdministracion(numero), siglas: siglasAdministracion(numero) }
}
```

`crearNuevaCuenta` (devuelve `Resultado<{ id: string; nombre: string; usuario: string }>`):

```ts
  const entrada = esquemaNuevaCuenta.safeParse({
    nombre: formData.get('nombre') ?? undefined,
    siglas: formData.get('siglas') ?? undefined,
    usuario: formData.get('usuario'),
    rol: formData.get('rol'),
    contrasena: formData.get('contrasena'),
  })
  if (!entrada.success) return fallo(MENSAJE_REVISAR, camposConError(entrada.error))
  const datos = entrada.data

  const admin = crearClienteAdmin()
  const { data: existente, error: errorBusqueda } = await admin
    .from('perfiles')
    .select('id')
    .eq('usuario', datos.usuario)
    .maybeSingle()
  if (errorBusqueda) {
    console.error('crearNuevaCuenta: no se pudo validar el usuario', errorBusqueda)
    return fallo('No se pudo crear la cuenta. Intentá de nuevo.')
  }
  if (existente) return fallo(MENSAJE_REVISAR, { usuario: MENSAJE_USUARIO_REPETIDO })

  let identidad: { nombre: string; siglas: string }
  if (datos.rol === 'administracion') {
    const generica = await identidadDeAdministracion(admin)
    if ('error' in generica) {
      console.error('crearNuevaCuenta: no se pudo leer los nombres de Administración', generica.error)
      return fallo('No se pudo crear la cuenta. Intentá de nuevo.')
    }
    identidad = generica
  } else {
    identidad = { nombre: datos.nombre, siglas: datos.siglas }
  }

  // crearCuenta registra el error y borra el usuario de Auth si falla el perfil (spec §4).
  const resultado = await crearCuenta(admin, {
    ...identidad,
    usuario: datos.usuario,
    rol: datos.rol,
    contrasena: datos.contrasena,
    debeCambiarContrasena: true,
  })
  if (!resultado.ok) {
    // Otra persona creó ese usuario entre la validación y el alta: lo rechaza la base.
    if (resultado.error === MENSAJE_USUARIO_REPETIDO) return fallo(MENSAJE_REVISAR, { usuario: resultado.error })
    return fallo(resultado.error)
  }

  revalidatePath('/configuraciones')
  return exito({ id: resultado.id, nombre: identidad.nombre, usuario: datos.usuario })
```

`cambiarRolCuenta`, después de la guarda del propio rol:

```ts
  const admin = crearClienteAdmin()
  let cambios: { rol: Rol; nombre?: string; siglas?: string } = { rol }
  if (rol === 'administracion') {
    // Entrar a Administración cambia el nombre por uno genérico; quien ya estaba conserva el suyo.
    const { data: actual, error: errorLectura } = await admin.from('perfiles').select('rol').eq('id', id).maybeSingle()
    if (errorLectura) {
      console.error(`cambiarRolCuenta: no se pudo leer la cuenta (usuario ${id})`, errorLectura)
      return fallo('No se pudo cambiar el rol. Intentá de nuevo.')
    }
    if (!actual) return fallo('La cuenta no existe.')
    if (actual.rol !== 'administracion') {
      const generica = await identidadDeAdministracion(admin)
      if ('error' in generica) {
        console.error(`cambiarRolCuenta: no se pudo leer los nombres de Administración (usuario ${id})`, generica.error)
        return fallo('No se pudo cambiar el rol. Intentá de nuevo.')
      }
      cambios = { rol, ...generica }
    }
  }

  const { data, error } = await admin.from('perfiles').update(cambios).eq('id', id).select('id')
```

(el resto, igual; `revalidatePath('/', 'layout')` además del de `/configuraciones` si cambió el nombre.)

`cambiarUsuarioCuenta` (nueva, en la sección "Gestión de usuarios"):

```ts
export async function cambiarUsuarioCuenta(
  _previo: Resultado<{ usuario: string }> | null,
  formData: FormData,
): Promise<Resultado<{ usuario: string }>> {
  const acceso = await perfilParaAccion('director')
  if (!acceso.ok) return acceso

  const entrada = esquemaCambioUsuario.safeParse({ id: formData.get('id'), usuario: formData.get('usuario') })
  if (!entrada.success) return fallo(MENSAJE_REVISAR, camposConError(entrada.error))
  const { id, usuario } = entrada.data

  // Solo la columna: la dirección interna de Auth no depende del usuario.
  const { data, error } = await crearClienteAdmin().from('perfiles').update({ usuario }).eq('id', id).select('id')
  if (error) {
    if (error.code === '23505') return fallo(MENSAJE_REVISAR, { usuario: MENSAJE_USUARIO_REPETIDO })
    console.error(`cambiarUsuarioCuenta: no se pudo cambiar el usuario (usuario ${id})`, error)
    return fallo('No se pudo cambiar el usuario. Intentá de nuevo.')
  }
  if (data.length === 0) return fallo('La cuenta no existe.')

  revalidatePath('/configuraciones')
  return exito({ usuario })
}
```

Imports: quitar `MENSAJE_CORREO_REPETIDO`; agregar `MENSAJE_USUARIO_REPETIDO`, `esquemaCambioUsuario`, las tres funciones de `@/lib/cuentas/administracion` y `type Rol` de `@/lib/perfiles/roles`. El comentario de `cambiarMiContrasena` pasa a: "La dirección de inicio de sesión sale de Auth (`getUser()`): `perfiles` no la guarda."

- [ ] **Step 5:** Run: `npx vitest run --project unit tests/unit/configuraciones` → PASS.

- [ ] **Step 6: Commit** — `feat(ajustes): cuentas con usuario, cambio de usuario y nombre genérico de Administración`

---

### Task 7: pantallas de Ajustes

**Files:**
- Modify: `app/(app)/configuraciones/_componentes/formulario-mi-cuenta.tsx`, `seccion-mi-cuenta.tsx`, `fila-cuenta.tsx`, `seccion-gestion-usuarios.tsx`, `modal-nueva-cuenta.tsx`, `modal-cambiar-rol.tsx`, `modal-contrasena-temporal.tsx`
- Create: `app/(app)/configuraciones/_componentes/modal-cambiar-usuario.tsx`
- Modify: `app/globals.css` (solo si hace falta un estilo de campo de solo lectura)

- [ ] **Step 1: Mi cuenta** — `SeccionMiCuenta` pasa `usuario={perfil.usuario}` (ya no `correo`). `FormularioMiCuenta`:
  - props `{ nombre, siglas, usuario, rol }`; sin estado de correo; `useAvisoDeResultado` igual.
  - Si `rol === 'administracion'`: Nombre y Siglas `readOnly`, sin botón "Guardar cambios", con la ayuda bajo el nombre: *"En Administración el nombre lo pone la app: la casa no ve nombres reales."*
  - Campo nuevo, siempre de solo lectura (plano = solo lectura, DESIGN.md):

```tsx
        <div className="field">
          <label htmlFor="mi-usuario">Usuario</label>
          <input id="mi-usuario" value={props.usuario} readOnly autoComplete="username" />
          <div className="hint">Con este usuario iniciás sesión. Para cambiarlo, hablá con el Director.</div>
        </div>
```

  - Ver cómo se ve un `<input readOnly>` con el CSS actual; si se confunde con un campo editable (hundido), agregar en `globals.css` una regla `.field input[readonly]` plana (sin relieve hundido, fondo del papel, borde punteado), siguiendo la de `.enlace-item input[readonly]` (~línea 1473).

- [ ] **Step 2: `fila-cuenta.tsx`**
  - `<td data-et="Usuario">{cuenta.usuario}</td>`.
  - Prop nueva `alCambiarUsuario: () => void`. La celda de acciones se pinta siempre: "Cambiar usuario" (`aria-label={`Cambiar usuario de ${cuenta.nombre}`}`) para todas las filas; "Contraseña temporal" y "Desactivar/Reactivar" siguen solo si `!esPropia`.
  - `cambiarRol`: también pide confirmación al pasar a Administración —`if (nuevo === 'director' || rol === 'director' || nuevo === 'administracion')`—; el comentario de `alConfirmarRol`: "Dar o quitar el rol Director, o pasar a Administración (cambia el nombre), pasa por una confirmación".
  - Al salir de Administración por cambio directo, el aviso es: `Rol actualizado. Pedile que ponga su nombre en Ajustes → Mi cuenta.`

- [ ] **Step 3: `modal-cambiar-usuario.tsx`** (mismo patrón que `modal-contrasena-temporal.tsx`):

```tsx
'use client'

import { useActionState, useState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { Modal } from '@/components/ui/modal'
import type { Cuenta } from '@/lib/configuraciones/tipos'
import { cambiarUsuarioCuenta } from '../acciones'
import { accionDeFormulario } from './llamar-accion'
import { useAvisoDeResultado } from './usar-aviso-resultado'

const cambiarUsuarioCuentaSegura = accionDeFormulario(cambiarUsuarioCuenta)

export function ModalCambiarUsuario({ cuenta, alCerrar }: { cuenta: Cuenta | null; alCerrar: () => void }) {
  // Montado solo mientras está abierto (y uno por cuenta): cada apertura empieza con el usuario vigente.
  return cuenta ? <FormularioCambiarUsuario key={cuenta.id} cuenta={cuenta} alCerrar={alCerrar} /> : null
}

function FormularioCambiarUsuario({ cuenta, alCerrar }: { cuenta: Cuenta; alCerrar: () => void }) {
  const [estado, accion, pendiente] = useActionState(cambiarUsuarioCuentaSegura, null)
  const [usuario, setUsuario] = useState(cuenta.usuario)
  const campos = estado && !estado.ok ? estado.campos : undefined
  useAvisoDeResultado(estado, null)

  return (
    <Modal titulo="Cambiar usuario" abierto alCerrar={alCerrar} bloquearCierre={pendiente}>
      {estado?.ok ? (
        <>
          <p>
            {cuenta.nombre} ahora entra con el usuario <strong>{estado.data.usuario}</strong>.
          </p>
          <p className="hint">Avisale: el usuario anterior ya no sirve. La contraseña no cambió.</p>
          <div className="modal-foot">
            <button type="button" className="btn" onClick={alCerrar} autoFocus>
              Listo
            </button>
          </div>
        </>
      ) : (
        <form action={accion} noValidate>
          <input type="hidden" name="id" value={cuenta.id} />
          <div className="field">
            <label htmlFor="cambiar-usuario">Usuario de {cuenta.nombre}</label>
            <input
              id="cambiar-usuario"
              name="usuario"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
            />
            <div className="hint">Letras sin tilde, números, punto o guion. Ejemplo: r.flores</div>
            {campos?.usuario && <div className="campo-error">{campos.usuario}</div>}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={alCerrar} disabled={pendiente}>
              Cancelar
            </button>
            <BotonEnvio textoPendiente="Guardando…">Guardar usuario</BotonEnvio>
          </div>
        </form>
      )}
    </Modal>
  )
}
```

  Revisar cómo `ContrasenaParaEntregar` lleva el foco a "Listo" y hacer lo mismo si `autoFocus` no alcanza dentro de `Modal`.

- [ ] **Step 4: `seccion-gestion-usuarios.tsx`** — encabezado "Usuario"; descripción: "…Cada persona edita su propio nombre y siglas; el usuario con el que entra lo ponés vos."; estado `cambiandoUsuario` + `<ModalCambiarUsuario cuenta={cambiandoUsuario} alCerrar={…} />`; `const numeroAdministracion = siguienteNumeroAdministracion(cuentas.map((c) => c.nombre))`, que se pasa a `ModalNuevaCuenta` y a `ModalCambiarRol`.

- [ ] **Step 5: `modal-nueva-cuenta.tsx`** — recibe `numeroAdministracion: number`.
  - Orden de campos: **Rol**, Usuario, y —solo si el rol no es Administración— Nombre completo y Siglas; al final la contraseña temporal.
  - Con rol Administración, en lugar de nombre y siglas: `<p className="hint">Se va a llamar «{nombreAdministracion(n)}» ({siglasAdministracion(n)}): la casa no ve el nombre real de Administración.</p>`
  - Usuario: campo de texto (`autoCapitalize="none"`, `autoCorrect="off"`, `spellCheck={false}`, `autoComplete="off"`) con ayuda "Con esto va a entrar. Ejemplo: r.flores". Al cambiar el rol **a** Administración, si el usuario está vacío queda propuesto `usuarioSugeridoAdministracion(n)`; al salir de Administración, si el usuario sigue siendo esa propuesta, se vacía.
  - Éxito: `mensaje={`Cuenta creada: ${estado.data.nombre}. Usuario: ${estado.data.usuario}.`}`.

- [ ] **Step 6: `modal-cambiar-rol.tsx`** — recibe `numeroAdministracion`. Tres casos, que se pueden combinar (Director → Administración):
  - `aAdministracion = cambio.rol === 'administracion'`: pregunta "¿Pasar a **{nombre}** a Administración?"; ayuda: "Va a llamarse «Administración N» (AN): la casa no ve el nombre real de Administración." (más la ayuda de quitar Director si lo era); botón "Pasar a Administración".
  - Los dos casos de Director, como hoy. `quitaDirector` necesita saber el rol actual: `cambio.cuenta.rol === 'director'`.
  - El comentario del componente: "Confirmación para dar o quitar el rol Director, o para pasar una cuenta a Administración."

- [ ] **Step 7: `modal-contrasena-temporal.tsx`** — `{cuenta.nombre} ({cuenta.usuario}) deberá elegir…`.

- [ ] **Step 8:** `npm run lint && npm run typecheck && npm test` → PASS (salvo scripts, Task 8).

- [ ] **Step 9: Commit** — `feat(ajustes): pantallas con usuario; Administración con nombre genérico`

---

### Task 8: scripts y soporte de pruebas

**Files:**
- Modify: `scripts/crear-director.ts`, `scripts/demo/tipos.ts`, `scripts/demo/usuarios.ts`, `scripts/datos-demo.ts`, `scripts/limpiar-datos-demo.ts`, `README.md`
- Modify: `tests/soporte/usuarios-prueba.ts`

- [ ] **Step 1: `crear-director.ts`** — opción `usuario` en vez de `correo`; se normaliza y se valida con `usuarioValido` (si no, mensaje y `exit 1`); se comprueba que no exista; mensajes: `Uso: npm run crear-director -- --nombre "María Fernández" --siglas MF --usuario m.fernandez` y `Director creado. Usuario: m.fernandez`.

- [ ] **Step 2: Demo** — `scripts/demo/tipos.ts`: quitar `DOMINIO_DEMO`; `export { PREFIJO_DEMO } from '@/lib/cuentas/usuario'` y `export const usuarioDemo = (clave: ClaveDemo) => `${PREFIJO_DEMO}${clave}``. `usuarios.ts`: busca por `usuario`, crea con `usuario: usuarioDemo(clave)`; la de Administración se crea con `nombre: nombreAdministracion(n)` / `siglas` genéricas, donde `n` sale de `siguienteNumeroAdministracion` sobre los nombres existentes (misma consulta que la acción). `limpiar-datos-demo.ts`: `.select('id, usuario').like('usuario', `${PREFIJO_DEMO}%`)`. `datos-demo.ts`: "Crea cuentas y datos de desarrollo (usuarios demo.…)".

- [ ] **Step 3: `README.md`** — línea 18: "Entrar con el usuario `demo.residente`… (u otra cuenta demo: `demo.director`, `demo.sacerdote`, `demo.numerario`, `demo.administracion`)"; la tabla de comandos: `--usuario …` y "Cuentas y datos demo (usuarios `demo.…`)".

- [ ] **Step 4: `usuarios-prueba.ts`** — cada entrada de `USUARIOS_PRUEBA` gana `usuario` (`director`, `director2`, `residente`, `residente2`, `admin`); `correo` queda como la dirección de Auth de esa cuenta de prueba (comentarlo: "la dirección con la que Auth conoce a la cuenta; la persona entra con `usuario`"). `asegurarUsuariosPrueba`: busca por `usuario`; al existir, el `update` también fija `usuario`; al crear, el `insert` lleva `usuario` y **no** `correo`. `clienteComo` no cambia (entra con la dirección fija).

- [ ] **Step 5:** `npm run lint && npm run typecheck && npm test` → todo PASS.

- [ ] **Step 6: Commit** — `chore: scripts y soporte de pruebas con usuario`

---

### Task 9: integración y e2e (corren en el CI)

**Files:**
- Create: `tests/integration/cuentas.test.ts`
- Modify: `tests/e2e/login.spec.ts`, `configuraciones.spec.ts`, `calendario.spec.ts`, `comidas.spec.ts`, `comidas-casa.spec.ts`, `instalar.spec.ts`, `mensajes.spec.ts`, `push.spec.ts`

- [ ] **Step 1: `tests/integration/cuentas.test.ts`** (mirar `tests/integration/base.test.ts` para el arranque: `clienteAdminPrueba`, limpieza):

```ts
import { createClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it } from 'vitest'
import { MENSAJE_USUARIO_REPETIDO } from '@/lib/configuraciones/errores'
import { crearCuenta } from '@/lib/cuentas/crear-cuenta'
import { direccionDeAcceso } from '@/lib/cuentas/direccion-de-acceso'
import { DIRECCION_INEXISTENTE, esDireccionInterna } from '@/lib/cuentas/usuario'
import { clienteAdminPrueba } from '../soporte/usuarios-prueba'

const admin = clienteAdminPrueba()
const USUARIO = 'cuenta.integracion'
const CONTRASENA = 'clave-de-integracion-1'

async function borrar() {
  const { data } = await admin.from('perfiles').select('id').like('usuario', 'cuenta.integracion%')
  for (const { id } of data ?? []) await admin.auth.admin.deleteUser(id)
}

afterEach(borrar)

const datos = { nombre: 'Cuenta de integración', siglas: 'CI', usuario: USUARIO, rol: 'residente' as const, contrasena: CONTRASENA, debeCambiarContrasena: false }

describe('cuentas con usuario', () => {
  it('se crea sin correo real y se entra con la dirección que el servidor busca por usuario', async () => {
    const resultado = await crearCuenta(admin as never, datos)
    expect(resultado.ok).toBe(true)

    const { data: perfil } = await admin.from('perfiles').select('usuario, correo').eq('usuario', USUARIO).single()
    expect(perfil).toEqual({ usuario: USUARIO, correo: null })

    const direccion = await direccionDeAcceso(admin as never, USUARIO)
    expect(direccion.ok && esDireccionInterna(direccion.correo)).toBe(true)

    const sesion = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await sesion.auth.signInWithPassword({
      email: direccion.ok ? direccion.correo : '',
      password: CONTRASENA,
    })
    expect(error).toBeNull()
    expect(data.user?.id).toBe(resultado.ok ? resultado.id : '')
  })

  it('un usuario que no existe da una dirección que no es de nadie', async () => {
    expect(await direccionDeAcceso(admin as never, 'no.existe.nadie')).toEqual({ ok: true, correo: DIRECCION_INEXISTENTE })
  })

  it('un usuario repetido no deja una cuenta de Auth huérfana', async () => {
    expect((await crearCuenta(admin as never, datos)).ok).toBe(true)
    const { data: antes } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    expect(await crearCuenta(admin as never, datos)).toEqual({ ok: false, error: MENSAJE_USUARIO_REPETIDO })
    const { data: despues } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    expect(despues.users.length).toBe(antes.users.length)
  })

  it('la base solo acepta usuarios normalizados', async () => {
    const { data } = await admin.auth.admin.createUser({ email: 'formato@prueba.test', password: CONTRASENA, email_confirm: true })
    const id = data.user!.id
    try {
      for (const usuario of ['R.Flores', 'ab', 'r..flores', 'r flores']) {
        const { error } = await admin.from('perfiles').insert({ id, nombre: 'Formato', siglas: 'FO', usuario, rol: 'residente' })
        expect(error?.code, usuario).toBe('23514')
      }
    } finally {
      await admin.auth.admin.deleteUser(id)
    }
  })
})
```

- [ ] **Step 2: Ayudantes de sesión de los e2e** — en los ocho archivos, el `iniciarSesion` local llena `getByLabel('Usuario')` con `USUARIOS_PRUEBA[clave].usuario` (o recibe el usuario donde hoy recibe el correo). Toda búsqueda `.eq('correo', …)` / `.in('correo', …)` sobre `perfiles` pasa a `usuario`. `grep -rn "correo\|Correo" tests/e2e` debe quedar solo con lo que se nombra en los pasos 3 y 4.

- [ ] **Step 3: `login.spec.ts`** — mensajes "Usuario o contraseña incorrectos."; la prueba del campo conservado se llama "el usuario se conserva después de un error"; y dos pruebas nuevas:

```ts
test('se entra igual escribiendo el usuario con mayúsculas o el correo de siempre', async ({ page }) => {
  for (const escrito of ['RESIDENTE', 'residente@prueba.test']) {
    await page.goto('/login')
    await page.getByLabel('Usuario').fill(escrito)
    await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page).toHaveURL(/\/comidas\/semana$/)
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/login$/)
  }
})

test('un usuario que no existe recibe el mismo mensaje que una contraseña incorrecta', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill('no.existe.nadie')
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible()
})
```

- [ ] **Step 4: `configuraciones.spec.ts`**
  - Constantes: `USUARIO_CUENTA_NUEVA = 'cuenta.nueva'`, `USUARIO_DESECHABLE = 'cuenta.desechable'`, `USUARIO_DESECHABLE_NUEVO = 'cuenta.cambiada'`, `USUARIO_ADMIN_NUEVO = 'admin.e2e'`.
  - `borrarCuentas(usuarios)`: por `perfiles.usuario`; además borra los usuarios de Auth con dirección interna (`esDireccionInterna`) que no tengan perfil (pruebas cortadas a mitad).
  - `crearCuentaDesechable(usuario)`: `createUser` con `direccionInterna()` y perfil con `usuario`.
  - "un residente ve Mi cuenta…": además, el campo "Usuario" está, es de solo lectura (`toHaveAttribute('readonly', '')`) y muestra `residente`.
  - La prueba "una persona cambia su propio correo…" se reemplaza por **"el Director cambia el usuario de una cuenta y la persona entra solo con el nuevo"**: crea la desechable; como Director abre "Cambiar usuario" de esa fila, escribe `Cuenta.Cambiada`, guarda, ve "ahora entra con el usuario **cuenta.cambiada**"; cierra sesión; con el usuario viejo, "Usuario o contraseña incorrectos."; con el nuevo, entra.
  - "el Director crea una cuenta…": elige Rol, llena Usuario (`Cuenta.Nueva`), Nombre completo y Siglas; el diálogo de entrega dice "Usuario: cuenta.nueva"; la persona entra con ese usuario y la temporal.
  - Prueba nueva **"el Director crea una cuenta de Administración sin escribir ningún nombre"**: al elegir rol Administración desaparecen "Nombre completo" y "Siglas", aparece "Se va a llamar «Administración N»" y el usuario viene propuesto como `admin.N`; lo cambia a `admin.e2e`, crea; la tabla muestra una fila `Administración N` con usuario `admin.e2e`; esa cuenta entra, y en Ajustes → Mi cuenta su nombre es de solo lectura y no hay "Guardar cambios".
  - "…pone una contraseña temporal…": el texto es `Residente Dos (residente2)`.
  - Prueba nueva en "el Director cambia el rol…": pasar a Administración pide confirmación con "Va a llamarse «Administración N»"; al confirmar, la fila cambia de nombre. (`afterEach` → `asegurarUsuariosPrueba()` le devuelve el nombre.)

- [ ] **Step 5: Commit** — `test: integración y e2e de entrar con usuario`

---

### Task 10: documentación

- [ ] **Step 1: `CLAUDE.md`** — un punto nuevo en "Modelo de datos y reglas de negocio":

> **Se entra con usuario, no con correo** (`perfiles.usuario`: único, normalizado con `normalizarUsuario()` de `lib/cuentas/usuario.ts`; mismo formato en zod y en el `check` de la base). Lo pone y lo cambia solo el Director (`cambiarUsuarioCuenta`); cambiarlo es actualizar esa columna. Auth exige un correo: cada cuenta tiene una **dirección interna** opaca (`<uuid>@cuentas.molino.invalid`, `direccionInterna()`), que nadie ve ni escribe; el login la busca con la llave secreta (`direccionDeAcceso()`: `perfiles` → `auth.admin.getUserById`) y un usuario inexistente sigue el mismo camino con `DIRECCION_INEXISTENTE` (mismo mensaje, sin revelar qué usuarios existen). Quien escribe un correo viejo pasa por `usuarioDesdeCorreo()`, espejo de la limpieza de la migración `20261005110000` (casos en `tests/fixtures/casos-usuario.json`). El prefijo `demo.` es de los scripts: lo rechazan solo los formularios. **Las cuentas de Administración se llaman "Administración N" / "AN"** (`lib/cuentas/administracion.ts`): la casa no ve su nombre real, el servidor lo pone al crearlas o al pasarlas a ese rol, y ellas no pueden editarlo.

  Y en la parte de pruebas: "en tests, `USUARIOS_PRUEBA[clave].usuario` es con lo que se entra por la pantalla; `.correo` es la dirección de Auth con la que entra `clienteComo()`."

- [ ] **Step 2: Spec** — si durante la implementación cambió algún detalle (textos, nombres de función), dejar el spec al día.

- [ ] **Step 3: Commit** — `docs: se entra con usuario`

---

### Task 11: verificación y PR

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm test` → PASS; build con variables de prueba → PASS.

- [ ] **Step 2: Pantallas** — con `next start` del build de prueba, `/login` a 320 / 375 / 768 / 1280 px en claro, oscuro, alto contraste y letra enorme (es pública: no necesita backend). Para Ajustes (Mi cuenta, tabla de usuarios, los tres modales), el arnés estático del scratchpad con los componentes reales, como en el PR 1: nada desborda, objetivo táctil ≥ 56px en los botones nuevos, la letra no baja de `--t-xs`, y la tabla de usuarios con el botón nuevo no rompe en teléfono con letra enorme.

- [ ] **Step 3:** Si el PR 1 ya está en `master`: `git rebase origin/master` (descarta los commits del PR 1), regenerar tipos si hace falta, y volver a correr el Step 1. `git push -u origin claude/entrar-con-usuario` y abrir el PR contra `master`.

- [ ] **Step 4:** El cuerpo del PR, por rol; el SQL de la migración A; **"aplicar la migración JUSTO ANTES de mergear: sin ella, con este código no entra nadie"**; qué hacer después (repartir la lista que devuelve la migración; crear una cuenta de prueba para confirmar que producción acepta las direcciones `.invalid`; la prueba en el teléfono del spec §4).

- [ ] **Step 5:** CI en verde (`calidad`, `base-de-datos`, e2e); reemplazar `database.types.ts` por el artefacto del CI si difiere.
