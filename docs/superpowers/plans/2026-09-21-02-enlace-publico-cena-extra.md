# Enlace público de confirmación de cena extra — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** el Director genera, desde un evento del calendario, un enlace público (sin sesión) con
vencimiento configurable, para que gente externa confirme cuántas cenas/comidas extra necesita.
Administración solo ve el total agregado (eso lo consume el plan de "vista agregada", no este).

**Arquitectura:** dos tablas nuevas (`enlaces_confirmacion`, `confirmaciones_extra`) sin ningún
privilegio directo para `anon` ni `authenticated` salvo el Director (lectura/creación). El acceso
público pasa por exactamente dos funciones `security definer` otorgadas también a `anon` — mismo
patrón que `eventos_para_cocina()`. Es la primera ruta de la app que acepta una escritura sin sesión:
usa un cliente de Supabase nuevo, sin cookies.

**Stack:** Next.js (App Router), TypeScript, `@supabase/supabase-js`, zod 4, Vitest, Playwright,
Postgres 17 (Supabase).

**Referencias:** spec [`docs/superpowers/specs/2026-09-21-eventos-mensajes-comidas-design.md`](../specs/2026-09-21-eventos-mensajes-comidas-design.md)
§3 y §6 · plan hermano [`2026-09-21-01-categorias-evento-pedidos.md`](2026-09-21-01-categorias-evento-pedidos.md)
(no es un prerrequisito técnico: `enlaces_confirmacion.evento_id` solo necesita que `eventos` exista,
sin importar sus categorías) · modelo de función pública `supabase/migrations/20260921170000_eventos_tipos_cocina.sql`
(`eventos_para_cocina`) · próximo código de error libre: `MOL05` (MOL01-04 ya usados, ver Tarea 1).

**Antes de empezar:**
- Esta rama sale de `master` actualizado.
- Pruebas de integración y e2e: banco de pruebas local (CLAUDE.md "Probar SQL antes del PR") o CI.

---

## Decisiones de esta pista

- **El token es el único control de acceso**: aleatorio, 128 bits, columna `unique`, sin relación con
  el `id` interno. `anon` no tiene ningún GRANT sobre las tablas — todo pasa por las dos funciones.
- **Vencimiento: hora exacta, no "X horas antes"** (spec §3, confirmado con el usuario): el Director
  elige fecha y hora de corte directamente al crear el enlace.
- **Revocar antes de tiempo = adelantar `vence_en`**, no borrar la fila (spec §3, regla 6): borrar
  arrastraría en cascada las confirmaciones ya recibidas, que cuentan igual para la cocina aunque el
  enlace se cierre antes. Por eso hay `grant update (vence_en)` — nada más.
- **Un evento puede tener varios enlaces** (ej. uno para almuerzo y otro para cena el mismo día). El
  panel del Director lista todos los que existan para ese evento, no asume que hay uno solo.
- **Sin nombre de usuario en `confirmaciones_extra`**: quien confirma no tiene cuenta. `nombre` es
  texto libre que escribe la persona, y `cantidad_personas` (1–10) cubre invitados.
- **Cliente de Supabase nuevo** (`lib/supabase/publico.ts`), calcado de `lib/supabase/admin.ts` pero
  con la llave `anon` en vez de la secreta: sin cookies, sin sesión persistida.
- **La hora de vencimiento se arma con `instanteEnZona()`** (`lib/fechas`), igual que el resto de la
  app: nunca `new Date()` a mano para una fecha/hora que viene de un formulario.

---

## Mapa de archivos

```
supabase/migrations/20260921200000_enlaces_confirmacion.sql   nuevo — tablas, RLS, funciones públicas
lib/supabase/publico.ts                                        nuevo — cliente sin sesión
lib/validacion/calendario.ts                                   esquemas: crear enlace, confirmar cena
app/(app)/calendario/acciones.ts                                crearEnlaceConfirmacion, listarEnlacesDelEvento, revocarEnlaceConfirmacion
app/(app)/calendario/_componentes/modal-dia.tsx                 botón "Cena extra" en cal-evento-acciones
app/(app)/calendario/_componentes/enlace-cena-extra.tsx         nuevo — panel del Director (crear/listar/revocar)
app/confirmar-cena/[token]/page.tsx                             nuevo — página pública
app/confirmar-cena/[token]/acciones.ts                          nuevo — confirmarCena (sin sesión)
app/confirmar-cena/[token]/_componentes/formulario-confirmar.tsx nuevo — formulario público
lib/supabase/proxy.ts                                           agrega /confirmar-cena a RUTAS_PUBLICAS
tests/soporte/usuarios-prueba.ts                                 + clienteAnonimoPrueba()
tests/integration/calendario.test.ts                             RLS de las tablas nuevas + las dos funciones
tests/e2e/calendario.spec.ts                                     Director genera enlace; confirmación sin sesión; vencimiento; revocación
```

---

## Tareas

### Tarea 1: Migración — tablas, RLS y las dos funciones públicas

**Archivos:**
- Crear: `supabase/migrations/20260921200000_enlaces_confirmacion.sql`
- Test: `tests/soporte/usuarios-prueba.ts` (helper nuevo), `tests/integration/calendario.test.ts`

- [ ] **Paso 1: agregar el cliente anónimo de prueba**

En `tests/soporte/usuarios-prueba.ts`, después de `clienteComo`:

```ts
/** Cliente sin sesión (como lo usaría alguien que abre el enlace público). */
export function clienteAnonimoPrueba(): ClienteSinTipo {
  return createClient(url(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

- [ ] **Paso 2: escribir la migración**

```sql
-- =========================================================
-- Enlace público de confirmación de cena extra.
--
-- Primera escritura de la app sin sesión: el Director genera, desde un
-- evento, un enlace con vencimiento para que gente externa confirme cuántas
-- cenas/comidas extra necesita. El token es el único control de acceso —
-- anon no tiene ningún privilegio sobre estas tablas, solo puede llamar dos
-- funciones security definer.
-- =========================================================

create table public.enlaces_confirmacion (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos (id) on delete cascade,
  tiempo_comida public.tiempo_comida not null,
  vence_en timestamptz not null,
  -- gen_random_uuid() (sin extensión: ya lo usa toda la base) da 122 bits de aleatoriedad, de sobra
  -- para un token no adivinable. gen_random_bytes() daría lo mismo pero exige la extensión pgcrypto,
  -- que este repo nunca habilita (solo pg_cron y pg_net están creadas — ver otras migraciones).
  token text not null unique default gen_random_uuid()::text,
  creado_por uuid not null references public.perfiles (id) on delete cascade,
  creado_en timestamptz not null default now()
);

comment on table public.enlaces_confirmacion is
  'Enlace público (sin sesión) para confirmar comidas extra de un evento. El token es el único control de acceso.';

create index enlaces_confirmacion_evento_idx on public.enlaces_confirmacion (evento_id);

create table public.confirmaciones_extra (
  id uuid primary key default gen_random_uuid(),
  enlace_id uuid not null references public.enlaces_confirmacion (id) on delete cascade,
  nombre text not null check (nombre = btrim(nombre) and length(nombre) between 1 and 120),
  cantidad_personas smallint not null check (cantidad_personas between 1 and 10),
  creado_en timestamptz not null default now()
);

create index confirmaciones_extra_enlace_idx on public.confirmaciones_extra (enlace_id);

-- ---------- RLS: el Director ve y crea; nadie más lee ni escribe directo ----------
alter table public.enlaces_confirmacion enable row level security;
alter table public.confirmaciones_extra enable row level security;

revoke all on table public.enlaces_confirmacion from anon;
revoke all on table public.confirmaciones_extra from anon;
grant select, insert on table public.enlaces_confirmacion to authenticated;
grant select on table public.confirmaciones_extra to authenticated;
grant select, insert, update, delete on table public.enlaces_confirmacion to service_role;
grant select, insert, update, delete on table public.confirmaciones_extra to service_role;
-- Adelantar vence_en es la única forma de revocar antes de tiempo (spec §3, regla 6).
revoke update on table public.enlaces_confirmacion from authenticated;
grant update (vence_en) on table public.enlaces_confirmacion to authenticated;

create policy "enlaces_confirmacion: el Director los lee"
  on public.enlaces_confirmacion for select
  to authenticated
  using ((select public.mi_rol()) = 'director');

create policy "enlaces_confirmacion: el Director crea"
  on public.enlaces_confirmacion for insert
  to authenticated
  with check (
    (select public.mi_rol()) = 'director'
    and creado_por = (select auth.uid())
    and vence_en > (select now())
  );

create policy "enlaces_confirmacion: el Director adelanta el vencimiento"
  on public.enlaces_confirmacion for update
  to authenticated
  using ((select public.mi_rol()) = 'director')
  with check ((select public.mi_rol()) = 'director');

create policy "confirmaciones_extra: el Director las lee"
  on public.confirmaciones_extra for select
  to authenticated
  using ((select public.mi_rol()) = 'director');
-- Sin política de INSERT para nadie autenticado ni anónimo: solo entra por confirmar_cena_extra().

-- ---------- Acceso público: dos funciones, nada más ----------
create function public.info_enlace_confirmacion(p_token text)
returns table (
  evento_titulo text,
  fecha date,
  hora time,
  tiempo_comida public.tiempo_comida,
  vigente boolean,
  vence_en timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.titulo, e.fecha, e.hora, l.tiempo_comida, (now() < l.vence_en), l.vence_en
  from public.enlaces_confirmacion l
  join public.eventos e on e.id = l.evento_id
  where l.token = p_token
$$;

create function public.confirmar_cena_extra(p_token text, p_nombre text, p_cantidad smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enlace_id uuid;
  v_vence_en timestamptz;
begin
  select id, vence_en into v_enlace_id, v_vence_en
  from public.enlaces_confirmacion
  where token = p_token;

  if v_enlace_id is null then
    raise exception 'Este enlace no es válido.' using errcode = 'MOL05';
  end if;

  if now() >= v_vence_en then
    raise exception 'Este enlace ya venció.' using errcode = 'MOL05';
  end if;

  insert into public.confirmaciones_extra (enlace_id, nombre, cantidad_personas)
  values (v_enlace_id, p_nombre, p_cantidad);
end;
$$;

revoke execute on function public.info_enlace_confirmacion(text) from public;
revoke execute on function public.confirmar_cena_extra(text, text, smallint) from public;
grant execute on function public.info_enlace_confirmacion(text) to anon, authenticated, service_role;
grant execute on function public.confirmar_cena_extra(text, text, smallint) to anon, authenticated, service_role;
```

- [ ] **Paso 3: escribir las pruebas de integración**

En `tests/integration/calendario.test.ts`, agregar al final (usa `crearEventoDePrueba()`,
`clienteComo`, `admin`, `ids`, `FECHA`, `SIN_PERMISO` ya definidos en el archivo, más
`clienteAnonimoPrueba` importado desde `../soporte/usuarios-prueba`):

```ts
describe('enlaces_confirmacion: RLS y funciones públicas', () => {
  async function crearEnlaceDePrueba(vence: string = new Date(Date.now() + 3_600_000).toISOString()) {
    const evento = await crearEventoDePrueba()
    const { data, error } = await admin
      .from('enlaces_confirmacion')
      .insert({ evento_id: evento.id, tiempo_comida: 'cena', vence_en: vence, creado_por: ids.director })
      .select('id, token')
      .single()
    if (error) throw error
    return { ...data, eventoId: evento.id }
  }

  it('el Director crea un enlace; quien no tiene permiso no', async () => {
    const evento = await crearEventoDePrueba()
    const director = await clienteComo('director')
    const { error } = await director
      .from('enlaces_confirmacion')
      .insert({ evento_id: evento.id, tiempo_comida: 'cena', vence_en: new Date(Date.now() + 3_600_000).toISOString() })
    expect(error).toBeNull()

    for (const clave of SIN_PERMISO) {
      const cliente = await clienteComo(clave)
      const { error: errorAjeno } = await cliente
        .from('enlaces_confirmacion')
        .insert({ evento_id: evento.id, tiempo_comida: 'cena', vence_en: new Date(Date.now() + 3_600_000).toISOString() })
      expect(errorAjeno).not.toBeNull()
    }
  })

  it('rechaza un vencimiento en el pasado', async () => {
    const evento = await crearEventoDePrueba()
    const director = await clienteComo('director')
    const { error } = await director
      .from('enlaces_confirmacion')
      .insert({ evento_id: evento.id, tiempo_comida: 'cena', vence_en: new Date(Date.now() - 3_600_000).toISOString() })
    expect(error).not.toBeNull()
  })

  it('nadie lee enlaces_confirmacion ni confirmaciones_extra directo salvo el Director', async () => {
    const { id } = await crearEnlaceDePrueba()
    for (const clave of SIN_PERMISO) {
      const cliente = await clienteComo(clave)
      const { data } = await cliente.from('enlaces_confirmacion').select('id').eq('id', id)
      expect(data).toEqual([])
    }
    const anonimo = clienteAnonimoPrueba()
    const { data: dataAnonima, error: errorAnonimo } = await anonimo.from('enlaces_confirmacion').select('id')
    expect(errorAnonimo).not.toBeNull()
    expect(dataAnonima).toBeNull()
  })

  it('el Director adelanta el vencimiento; quien no tiene permiso no', async () => {
    const { id } = await crearEnlaceDePrueba()
    const director = await clienteComo('director')
    const pasado = new Date(Date.now() - 1000).toISOString()
    const { error } = await director.from('enlaces_confirmacion').update({ vence_en: pasado }).eq('id', id)
    expect(error).toBeNull()
    const { data } = await admin.from('enlaces_confirmacion').select('vence_en').eq('id', id).single()
    expect(data!.vence_en).toBe(pasado)
  })

  describe('info_enlace_confirmacion', () => {
    it('devuelve los datos del evento y si sigue vigente, sin sesión', async () => {
      const { token } = await crearEnlaceDePrueba()
      const anonimo = clienteAnonimoPrueba()
      const { data, error } = await anonimo.rpc('info_enlace_confirmacion', { p_token: token }).single()
      expect(error).toBeNull()
      expect(data).toMatchObject({ tiempo_comida: 'cena', vigente: true })
    })

    it('un token que no existe no devuelve filas', async () => {
      const anonimo = clienteAnonimoPrueba()
      const { data, error } = await anonimo.rpc('info_enlace_confirmacion', { p_token: 'no-existe' })
      expect(error).toBeNull()
      expect(data).toEqual([])
    })

    it('un enlace vencido: vigente en false', async () => {
      const { token } = await crearEnlaceDePrueba(new Date(Date.now() - 1000).toISOString())
      const anonimo = clienteAnonimoPrueba()
      const { data } = await anonimo.rpc('info_enlace_confirmacion', { p_token: token }).single()
      expect(data!.vigente).toBe(false)
    })
  })

  describe('confirmar_cena_extra', () => {
    it('una persona sin sesión confirma cena para ella y sus invitados', async () => {
      const { token, id } = await crearEnlaceDePrueba()
      const anonimo = clienteAnonimoPrueba()
      const { error } = await anonimo.rpc('confirmar_cena_extra', { p_token: token, p_nombre: 'Familia Pérez', p_cantidad: 3 })
      expect(error).toBeNull()
      const { data } = await admin.from('confirmaciones_extra').select('nombre, cantidad_personas').eq('enlace_id', id)
      expect(data).toEqual([{ nombre: 'Familia Pérez', cantidad_personas: 3 }])
    })

    it('rechaza confirmar en un enlace vencido, sin insertar', async () => {
      const { token, id } = await crearEnlaceDePrueba(new Date(Date.now() - 1000).toISOString())
      const anonimo = clienteAnonimoPrueba()
      const { error } = await anonimo.rpc('confirmar_cena_extra', { p_token: token, p_nombre: 'Tarde', p_cantidad: 1 })
      expect(error?.code).toBe('MOL05')
      const { data } = await admin.from('confirmaciones_extra').select('id').eq('enlace_id', id)
      expect(data).toEqual([])
    })

    it('rechaza un token que no existe', async () => {
      const anonimo = clienteAnonimoPrueba()
      const { error } = await anonimo.rpc('confirmar_cena_extra', { p_token: 'no-existe', p_nombre: 'X', p_cantidad: 1 })
      expect(error?.code).toBe('MOL05')
    })

    it('la base rechaza una cantidad fuera de rango', async () => {
      const { token } = await crearEnlaceDePrueba()
      const anonimo = clienteAnonimoPrueba()
      const { error } = await anonimo.rpc('confirmar_cena_extra', { p_token: token, p_nombre: 'X', p_cantidad: 11 })
      expect(error?.code).toBe('23514')
    })
  })
})
```

- [ ] **Paso 4: correr las pruebas de integración y confirmar que fallan, luego que pasan**

Correr: `npx vitest run --project integracion tests/integration/calendario.test.ts`
Esperado: FALLA (tablas/funciones no existen) → aplicar la migración al banco de prueba → PASA.

- [ ] **Paso 5: commit**

```bash
git add supabase/migrations/20260921200000_enlaces_confirmacion.sql tests/soporte/usuarios-prueba.ts tests/integration/calendario.test.ts
git commit -m "feat(calendario): enlace público de confirmación de cena extra (esquema)"
```

---

### Tarea 2: cliente de Supabase sin sesión

**Archivos:**
- Crear: `lib/supabase/publico.ts`

Sin prueba unitaria propia (envoltorio de una línea sobre `createClient`, ya cubierto por la Tarea 1
vía `clienteAnonimoPrueba`, que sigue el mismo patrón, y por los e2e de la Tarea 6).

- [ ] **Paso 1: crear el archivo**

```ts
import { createClient } from '@supabase/supabase-js'
import { variableEntorno } from '@/lib/entorno'
import type { Database } from './database.types'

/**
 * Cliente sin sesión: para la página pública de confirmación de cena extra. Nunca persiste ni
 * refresca sesión — quien la usa no tiene cuenta.
 */
export function crearClientePublico() {
  return createClient<Database>(
    variableEntorno('NEXT_PUBLIC_SUPABASE_URL'),
    variableEntorno('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
```

- [ ] **Paso 2: commit**

```bash
git add lib/supabase/publico.ts
git commit -m "feat(supabase): cliente sin sesión para páginas públicas"
```

---

### Tarea 3: validación zod — crear enlace y confirmar cena

**Archivos:**
- Modificar: `lib/validacion/calendario.ts`
- Test: `tests/unit/calendario/validacion.test.ts`

- [ ] **Paso 1: escribir las pruebas que fallan**

Agregar a `tests/unit/calendario/validacion.test.ts`:

```ts
import { esquemaConfirmarCena, esquemaCrearEnlace, /* ...lo que ya importaba... */ } from '@/lib/validacion/calendario'

const ID_EVENTO = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b'

describe('esquemaCrearEnlace', () => {
  const VALIDO_ENLACE = { evento_id: ID_EVENTO, tiempo_comida: 'cena', fecha_vencimiento: '2026-10-10', hora_vencimiento: '15:00' }

  it('acepta datos válidos', () => {
    expect(camposInvalidos(esquemaCrearEnlace, VALIDO_ENLACE)).toEqual([])
  })

  it.each(['desayuno', 'almuerzo', 'cena'])('acepta el tiempo de comida %s', (tiempo_comida) => {
    expect(camposInvalidos(esquemaCrearEnlace, { ...VALIDO_ENLACE, tiempo_comida })).toEqual([])
  })

  it('rechaza un tiempo de comida inválido', () => {
    expect(camposInvalidos(esquemaCrearEnlace, { ...VALIDO_ENLACE, tiempo_comida: 'merienda' })).toEqual(['tiempo_comida'])
  })

  it('rechaza un evento_id que no es uuid', () => {
    expect(camposInvalidos(esquemaCrearEnlace, { ...VALIDO_ENLACE, evento_id: 'no-uuid' })).toEqual(['evento_id'])
  })

  it.each(['15:5', '3pm', ''])('rechaza la hora %j', (hora_vencimiento) => {
    expect(camposInvalidos(esquemaCrearEnlace, { ...VALIDO_ENLACE, hora_vencimiento })).toEqual(['hora_vencimiento'])
  })
})

describe('esquemaConfirmarCena', () => {
  const VALIDO_CONFIRMACION = { token: 'abc123', nombre: 'Familia Pérez', cantidad_personas: '3' }

  it('acepta datos válidos y convierte la cantidad a número', () => {
    expect(esquemaConfirmarCena.parse(VALIDO_CONFIRMACION).cantidad_personas).toBe(3)
  })

  it('recorta el nombre', () => {
    expect(esquemaConfirmarCena.parse({ ...VALIDO_CONFIRMACION, nombre: '  Familia Pérez  ' }).nombre).toBe('Familia Pérez')
  })

  it.each(['0', '11', 'x', ''])('rechaza la cantidad %j', (cantidad_personas) => {
    expect(camposInvalidos(esquemaConfirmarCena, { ...VALIDO_CONFIRMACION, cantidad_personas })).toEqual(['cantidad_personas'])
  })

  it('rechaza un nombre vacío', () => {
    expect(camposInvalidos(esquemaConfirmarCena, { ...VALIDO_CONFIRMACION, nombre: '   ' })).toEqual(['nombre'])
  })
})
```

- [ ] **Paso 2: correr y confirmar que falla**

Correr: `npx vitest run --project unit tests/unit/calendario/validacion.test.ts`
Esperado: FALLA — `esquemaCrearEnlace`/`esquemaConfirmarCena` no existen.

- [ ] **Paso 3: agregar los esquemas**

En `lib/validacion/calendario.ts`, después de `esquemaEliminarEvento` (reutiliza `PATRON_HORA` ya
definido arriba en el archivo; importa `TIEMPOS_COMIDA` de `lib/comidas/tipos`):

```ts
import { TIEMPOS_COMIDA } from '@/lib/comidas/tipos'

export const esquemaCrearEnlace = z.object({
  evento_id: z.uuid('Evento inválido.'),
  tiempo_comida: z.enum(TIEMPOS_COMIDA, { error: 'Elegí el tiempo de comida.' }),
  fecha_vencimiento: z.iso.date('Fecha inválida.'),
  hora_vencimiento: z.string('Hora inválida.').trim().regex(PATRON_HORA, 'Usá el formato HH:MM.'),
})

export const esquemaRevocarEnlace = z.object({ id: z.uuid('Enlace inválido.') })

export const esquemaListarEnlaces = z.object({ evento_id: z.uuid('Evento inválido.') })

export const esquemaConfirmarCena = z.object({
  token: z.string('Enlace inválido.').min(1, 'Enlace inválido.'),
  nombre: z.string('Escribí tu nombre.').trim().min(1, 'Escribí tu nombre.').max(120, 'El nombre puede tener hasta 120 caracteres.'),
  cantidad_personas: z.coerce
    .number('Escribí un número.')
    .int('Escribí un número entero.')
    .min(1, 'Mínimo 1 persona.')
    .max(10, 'Máximo 10 personas.'),
})
```

- [ ] **Paso 4: correr y confirmar que pasa**

Correr: `npx vitest run --project unit tests/unit/calendario/validacion.test.ts`
Esperado: PASA.

- [ ] **Paso 5: commit**

```bash
git add lib/validacion/calendario.ts tests/unit/calendario/validacion.test.ts
git commit -m "feat(calendario): valida crear enlace y confirmar cena extra"
```

---

### Tarea 4: Server Actions del Director — crear, listar, revocar

**Archivos:**
- Modificar: `app/(app)/calendario/acciones.ts`

Sin prueba unitaria propia (delgadas sobre RLS ya probada en la Tarea 1); se verifican con los e2e de
la Tarea 6.

- [ ] **Paso 1: agregar las tres acciones**

En `app/(app)/calendario/acciones.ts`, después de `eliminarEvento` (agrega los imports que falten:
`esquemaCrearEnlace, esquemaListarEnlaces, esquemaRevocarEnlace` de `@/lib/validacion/calendario`,
`instanteEnZona` de `@/lib/fechas`):

```ts
export async function crearEnlaceConfirmacion(
  _previo: Resultado<{ id: string; token: string }> | null,
  formData: FormData,
): Promise<Resultado<{ id: string; token: string }>> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso

  const entrada = esquemaCrearEnlace.safeParse({
    evento_id: formData.get('evento_id'),
    tiempo_comida: formData.get('tiempo_comida'),
    fecha_vencimiento: formData.get('fecha_vencimiento'),
    hora_vencimiento: formData.get('hora_vencimiento'),
  })
  if (!entrada.success) return fallo('Revisá los datos del enlace.', camposConError(entrada.error))

  const vence_en = instanteEnZona(entrada.data.fecha_vencimiento, entrada.data.hora_vencimiento).toISOString()
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('enlaces_confirmacion')
    .insert({
      evento_id: entrada.data.evento_id,
      tiempo_comida: entrada.data.tiempo_comida,
      vence_en,
      creado_por: permiso.perfil.id,
    })
    .select('id, token')
    .single()
  if (error) return fallo('No se pudo generar el enlace. La hora de vencimiento debe ser futura.')

  revalidatePath('/calendario')
  return exito(data)
}

export async function listarEnlacesDelEvento(entrada: unknown): Promise<
  Resultado<{ id: string; token: string; tiempoComida: string; venceEn: string; confirmaciones: { nombre: string; cantidadPersonas: number }[] }[]>
> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso

  const datos = esquemaListarEnlaces.safeParse(entrada)
  if (!datos.success) return fallo('Evento inválido.')

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('enlaces_confirmacion')
    .select('id, token, tiempo_comida, vence_en, confirmaciones_extra(nombre, cantidad_personas)')
    .eq('evento_id', datos.data.evento_id)
    .order('creado_en')
  if (error) return fallo('No se pudieron cargar los enlaces.')

  return exito(
    data.map((e) => ({
      id: e.id,
      token: e.token,
      tiempoComida: e.tiempo_comida,
      venceEn: e.vence_en,
      confirmaciones: e.confirmaciones_extra.map((c) => ({ nombre: c.nombre, cantidadPersonas: c.cantidad_personas })),
    })),
  )
}

export async function revocarEnlaceConfirmacion(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso

  const datos = esquemaRevocarEnlace.safeParse(entrada)
  if (!datos.success) return fallo('Enlace inválido.')

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('enlaces_confirmacion')
    .update({ vence_en: new Date().toISOString() })
    .eq('id', datos.data.id)
    .select('id')
  if (error) return fallo('No se pudo revocar el enlace. Intentá de nuevo.')
  // RLS no da error si no hay filas afectadas (mismo caso que editarEvento): 0 filas = ya no existe.
  if (data.length === 0) return fallo('El enlace ya no existe.')

  revalidatePath('/calendario')
  return exito(null)
}
```

Nota: `confirmaciones_extra(nombre, cantidad_personas)` es un embed de PostgREST (relación FK
`confirmaciones_extra.enlace_id → enlaces_confirmacion.id`); requiere que los tipos de
`database.types.ts` estén regenerados (Tarea 8) para que el `select` tipado compile sin `as any`.

- [ ] **Paso 2: verificación manual**

Correr `npm run dev`, entrar como Director, y confirmar (una vez completada la Tarea 6) que se puede
generar un enlace desde un evento.

- [ ] **Paso 3: commit**

```bash
git add app/\(app\)/calendario/acciones.ts
git commit -m "feat(calendario): acciones del Director para enlaces de cena extra"
```

---

### Tarea 5: página pública y confirmación

**Archivos:**
- Crear: `app/confirmar-cena/[token]/page.tsx`
- Crear: `app/confirmar-cena/[token]/acciones.ts`
- Crear: `app/confirmar-cena/[token]/_componentes/formulario-confirmar.tsx`

Verificado con los e2e de la Tarea 6 (una página pública de un solo uso no justifica mocks de unit
test; el comportamiento real depende de la base, ya cubierta en la Tarea 1).

- [ ] **Paso 1: Server Action pública**

`app/confirmar-cena/[token]/acciones.ts`:

```ts
'use server'

import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { crearClientePublico } from '@/lib/supabase/publico'
import { esquemaConfirmarCena } from '@/lib/validacion/calendario'

export async function confirmarCena(_previo: Resultado<null> | null, formData: FormData): Promise<Resultado<null>> {
  const entrada = esquemaConfirmarCena.safeParse({
    token: formData.get('token'),
    nombre: formData.get('nombre'),
    cantidad_personas: formData.get('cantidad_personas'),
  })
  if (!entrada.success) return fallo('Revisá los datos.', undefined)

  const supabase = crearClientePublico()
  const { error } = await supabase.rpc('confirmar_cena_extra', {
    p_token: entrada.data.token,
    p_nombre: entrada.data.nombre,
    p_cantidad: entrada.data.cantidad_personas,
  })
  if (error) return fallo(error.code === 'MOL05' ? error.message : 'No se pudo confirmar. Intentá de nuevo.')

  return exito(null)
}
```

- [ ] **Paso 2: formulario cliente**

`app/confirmar-cena/[token]/_componentes/formulario-confirmar.tsx`:

```tsx
'use client'

import { useActionState, useState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { fallo, type Resultado } from '@/lib/acciones/resultado'
import { confirmarCena } from '../acciones'

export function FormularioConfirmarCena({ token }: { token: string }) {
  const [confirmado, setConfirmado] = useState(false)
  const [estado, accion] = useActionState(
    async (_previo: Resultado<null> | null, formData: FormData): Promise<Resultado<null>> => {
      let resultado: Resultado<null>
      try {
        resultado = await confirmarCena(null, formData)
      } catch {
        resultado = fallo('No se pudo confirmar. Revisá tu conexión e intentá de nuevo.')
      }
      if (resultado.ok) setConfirmado(true)
      return resultado
    },
    null,
  )

  if (confirmado) return <p className="aviso-exito">¡Listo! Tu cena quedó confirmada.</p>

  return (
    <form action={accion} className="form-confirmar-cena">
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label htmlFor="cc-nombre">Tu nombre</label>
        <input id="cc-nombre" name="nombre" required maxLength={120} />
      </div>
      <div className="field">
        <label htmlFor="cc-cantidad">¿Cuántas personas (contándote a vos)?</label>
        <input id="cc-cantidad" name="cantidad_personas" type="number" min={1} max={10} defaultValue={1} required />
      </div>
      {estado && !estado.ok && <div className="campo-error">{estado.error}</div>}
      <BotonEnvio>Confirmar cena</BotonEnvio>
    </form>
  )
}
```

- [ ] **Paso 3: página pública**

`app/confirmar-cena/[token]/page.tsx`:

```tsx
import { ETIQUETA_TIEMPO } from '@/lib/comidas/tipos'
import { crearClientePublico } from '@/lib/supabase/publico'
import { FormularioConfirmarCena } from './_componentes/formulario-confirmar'

export default async function PaginaConfirmarCena({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = crearClientePublico()
  const { data } = await supabase.rpc('info_enlace_confirmacion', { p_token: token }).maybeSingle()

  return (
    <main className="pagina-publica">
      <div className="card">
        {!data ? (
          <p className="aviso">Este enlace no es válido.</p>
        ) : (
          <>
            <h1>{data.evento_titulo}</h1>
            <p>
              {data.fecha} · {ETIQUETA_TIEMPO[data.tiempo_comida]}
              {data.hora ? ` · ${data.hora}` : ''}
            </p>
            {data.vigente ? <FormularioConfirmarCena token={token} /> : <p className="aviso">Este enlace ya venció.</p>}
          </>
        )}
      </div>
    </main>
  )
}
```

Fuera del grupo `(app)`: no hay layout propio, así que no pasa por `exigirPerfil()` (mismo patrón que
`app/login/` y `app/sin-conexion/`).

- [ ] **Paso 4: agregar la ruta a la lista blanca del proxy**

Este paso es **obligatorio**, no cosmético: este repo usa Next.js 16, que renombró `middleware.ts` a
`proxy.ts`. `proxy.ts` (raíz del repo) delega en `actualizarSesion()` (`lib/supabase/proxy.ts`), que
redirige a `/login` cualquier request sin sesión cuya ruta no esté en `RUTAS_PUBLICAS` — es por eso
que `/login` y `/sin-conexion` funcionan sin sesión, no solo porque les falta un layout. Sin este
paso, alguien sin sesión que abre el enlace público nunca llega a la página: el proxy lo manda a
`/login` antes de que corra nada de la Tarea 5.

En `lib/supabase/proxy.ts`, agregar `'/confirmar-cena'` al arreglo `RUTAS_PUBLICAS`:

```ts
const RUTAS_PUBLICAS = ['/login', '/api/cron', '/sw.js', '/manifest.webmanifest', '/iconos', '/apple-icon', '/sin-conexion', '/confirmar-cena']
```

- [ ] **Paso 5: commit**

```bash
git add "app/confirmar-cena" lib/supabase/proxy.ts
git commit -m "feat(calendario): página pública para confirmar cena extra"
```

---

### Tarea 6: panel del Director en el modal del día

**Archivos:**
- Modificar: `app/(app)/calendario/_componentes/modal-dia.tsx`
- Crear: `app/(app)/calendario/_componentes/enlace-cena-extra.tsx`

- [ ] **Paso 1: componente del panel**

`app/(app)/calendario/_componentes/enlace-cena-extra.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { llamarAccion } from '@/lib/acciones/llamar'
import { ETIQUETA_TIEMPO, TIEMPOS_COMIDA, type TiempoComida } from '@/lib/comidas/tipos'
import { crearEnlaceConfirmacion, listarEnlacesDelEvento, revocarEnlaceConfirmacion } from '../acciones'

type Enlace = {
  id: string
  token: string
  tiempoComida: string
  venceEn: string
  confirmaciones: { nombre: string; cantidadPersonas: number }[]
}

export function EnlaceCenaExtra({ eventoId }: { eventoId: string }) {
  const aviso = useAviso()
  const [abierto, setAbierto] = useState(false)
  const [enlaces, setEnlaces] = useState<Enlace[] | null>(null)
  const [pendiente, iniciar] = useTransition()
  const [tiempoComida, setTiempoComida] = useState<TiempoComida>('cena')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')

  function cargar() {
    iniciar(async () => {
      const resultado = await llamarAccion(() => listarEnlacesDelEvento({ evento_id: eventoId }))
      if (resultado.ok) setEnlaces(resultado.data)
      else aviso(resultado.error)
    })
  }

  function abrir() {
    setAbierto(true)
    if (!enlaces) cargar()
  }

  function crear() {
    iniciar(async () => {
      const formData = new FormData()
      formData.set('evento_id', eventoId)
      formData.set('tiempo_comida', tiempoComida)
      formData.set('fecha_vencimiento', fecha)
      formData.set('hora_vencimiento', hora)
      const resultado = await llamarAccion(() => crearEnlaceConfirmacion(null, formData))
      if (resultado.ok) {
        aviso('Enlace generado.')
        setFecha('')
        setHora('')
        cargar()
      } else {
        aviso(resultado.error)
      }
    })
  }

  function revocar(id: string) {
    iniciar(async () => {
      const resultado = await llamarAccion(() => revocarEnlaceConfirmacion({ id }))
      if (resultado.ok) {
        aviso('Enlace revocado.')
        cargar()
      } else {
        aviso(resultado.error)
      }
    })
  }

  if (!abierto) {
    return (
      <button type="button" className="link-btn" onClick={abrir}>
        Cena extra
      </button>
    )
  }

  return (
    <div className="panel-enlaces">
      {enlaces?.map((e) => {
        const total = e.confirmaciones.reduce((suma, c) => suma + c.cantidadPersonas, 0)
        const vencido = new Date(e.venceEn) <= new Date()
        return (
          <div key={e.id} className="card enlace-item">
            <div>
              {ETIQUETA_TIEMPO[e.tiempoComida as TiempoComida]} · {vencido ? 'vencido' : `vence ${new Date(e.venceEn).toLocaleString('es-SV')}`}
            </div>
            <input readOnly value={typeof window !== 'undefined' ? `${window.location.origin}/confirmar-cena/${e.token}` : ''} />
            <div>
              {total} {total === 1 ? 'persona confirmada' : 'personas confirmadas'}
            </div>
            <ul>
              {e.confirmaciones.map((c, i) => (
                <li key={i}>
                  {c.nombre} ({c.cantidadPersonas})
                </li>
              ))}
            </ul>
            {!vencido && (
              <button type="button" className="link-btn" onClick={() => revocar(e.id)} disabled={pendiente}>
                Revocar ahora
              </button>
            )}
          </div>
        )
      })}

      <div className="field">
        <label htmlFor={`${eventoId}-tiempo`}>Tiempo de comida</label>
        <select id={`${eventoId}-tiempo`} value={tiempoComida} onChange={(e) => setTiempoComida(e.target.value as TiempoComida)}>
          {TIEMPOS_COMIDA.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIEMPO[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${eventoId}-fecha`}>Vence el</label>
        <input id={`${eventoId}-fecha`} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${eventoId}-hora`}>Hora</label>
        <input id={`${eventoId}-hora`} type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
      </div>
      <button type="button" className="btn small" onClick={crear} disabled={pendiente || !fecha || !hora}>
        Generar enlace
      </button>
      <button type="button" className="btn ghost small" onClick={() => setAbierto(false)}>
        Cerrar
      </button>
    </div>
  )
}
```

- [ ] **Paso 2: wiring en `modal-dia.tsx`**

En `FilaEvento`, dentro de `.cal-evento-acciones` (junto a Editar/Eliminar), agregar
`<EnlaceCenaExtra eventoId={evento.id} />` e importar el componente nuevo.

- [ ] **Paso 3: verificación manual**

`npm run dev`, Director, abrir un evento, generar un enlace, copiar el link, abrirlo en otra pestaña
sin sesión, confirmar una cena, volver al panel del Director y refrescar para ver la confirmación.

- [ ] **Paso 4: commit**

```bash
git add app/\(app\)/calendario/_componentes/modal-dia.tsx app/\(app\)/calendario/_componentes/enlace-cena-extra.tsx
git commit -m "feat(calendario): panel del Director para generar y revocar enlaces de cena extra"
```

---

### Tarea 7: e2e

**Archivos:**
- Modificar: `tests/e2e/calendario.spec.ts`

- [ ] **Paso 1: escribir el escenario completo**

```ts
test('el Director genera un enlace, alguien sin sesión confirma, y el Director lo ve y lo revoca', async ({ page, context }) => {
  const ids = await asegurarUsuariosPrueba()
  const hoy = fechaISOEn(new Date())
  const { data: evento, error } = await clienteAdminPrueba()
    .from('eventos')
    .insert({ titulo: 'San Rafael', fecha: hoy, tipo: 'san_rafael', creado_por: ids.director })
    .select('id')
    .single()
  expect(error).toBeNull()

  await iniciarSesion(page, 'director')
  await page.goto('/calendario')
  await page.locator(`.cal-day[data-fecha="${hoy}"]`).click()
  const modal = page.getByRole('dialog')
  await modal.getByRole('button', { name: 'Cena extra' }).click()

  const manana = fechaISOEn(new Date(Date.now() + 24 * 3_600_000))
  await modal.getByLabel('Vence el').fill(manana)
  await modal.getByLabel('Hora').fill('15:00')
  await modal.getByRole('button', { name: 'Generar enlace' }).click()

  const enlaceInput = modal.locator('.enlace-item input[readonly]')
  await expect(enlaceInput).toBeVisible()
  const url = await enlaceInput.inputValue()

  // Alguien sin sesión, en una pestaña aparte.
  const paginaPublica = await context.newPage()
  await paginaPublica.goto(url)
  await expect(paginaPublica.getByText('San Rafael')).toBeVisible()
  await paginaPublica.getByLabel('Tu nombre').fill('Familia Pérez')
  await paginaPublica.getByLabel(/Cuántas personas/).fill('3')
  await paginaPublica.getByRole('button', { name: 'Confirmar cena' }).click()
  await expect(paginaPublica.getByText('¡Listo! Tu cena quedó confirmada.')).toBeVisible()
  await paginaPublica.close()

  // El Director recarga y ve la confirmación.
  await page.reload()
  await page.locator(`.cal-day[data-fecha="${hoy}"]`).click()
  const modal2 = page.getByRole('dialog')
  await modal2.getByRole('button', { name: 'Cena extra' }).click()
  await expect(modal2.getByText('Familia Pérez (3)')).toBeVisible()
  await expect(modal2.getByText('3 personas confirmadas')).toBeVisible()

  await modal2.getByRole('button', { name: 'Revocar ahora' }).click()
  await expect(modal2.getByText('vencido')).toBeVisible()

  // Ya revocado, ya no acepta confirmaciones nuevas.
  const paginaPublica2 = await context.newPage()
  await paginaPublica2.goto(url)
  await expect(paginaPublica2.getByText('Este enlace ya venció.')).toBeVisible()
  await paginaPublica2.close()

  void evento
})
```

- [ ] **Paso 2: correr y confirmar que pasa**

Correr: `npx playwright test tests/e2e/calendario.spec.ts -g "enlace"`
Esperado: PASA (con las Tareas 1-6 aplicadas).

- [ ] **Paso 3: commit**

```bash
git add tests/e2e/calendario.spec.ts
git commit -m "test(calendario): e2e del enlace público de cena extra"
```

---

### Tarea 8: tipos de Supabase y apertura del PR

- [ ] **Paso 1: push, descargar tipos de CI, revisar diff, commitear** — mismo procedimiento que la
  Tarea 6 del plan de categorías (`docs/superpowers/plans/2026-09-21-01-categorias-evento-pedidos.md`):

```bash
git push -u origin HEAD
gh run download "$(gh run list --branch "$(git branch --show-current)" --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId')" -n database-types -D lib/supabase
git add lib/supabase/database.types.ts
git commit -m "chore(calendario): regenera database.types.ts"
git push
```

- [ ] **Paso 2: abrir el PR**, confirmar CI en verde (`base-de-datos` puede necesitar
  `gh run rerun --failed` si falla por infraestructura del runner, no por el código).

**No fusionar sin que el usuario lo revise y mergee.**
