# Categorías de evento y pedidos a Administración — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** reemplazar las categorías de evento del calendario (`retiro|charla|visita|reunion|otro` →
`san_rafael|san_gabriel|san_miguel|otro`) y agregar un pedido de texto libre a Administración
(`requiere_otro_texto`), además del pedido fijo que ya existe (merienda/comida/materiales).

**Arquitectura:** un solo PR (esquema + funcionalidad, como ya se hizo en PR #9–#13 de este repo). El
enum se reemplaza por completo (no es un valor agregado a uno existente) con la técnica
renombrar-crear-migrar-soltar, en una sola migración. El resto son cambios de tipo/etiqueta y un campo
nuevo sobre la infraestructura de `eventos_para_cocina()` que ya existe (PR #12): no se toca RLS ni el
modelo de permisos.

**Stack:** Next.js (App Router), TypeScript, `@supabase/supabase-js`, zod 4, Vitest, Playwright,
Postgres 17 (Supabase).

**Referencias:** spec [`docs/superpowers/specs/2026-09-21-eventos-mensajes-comidas-design.md`](../specs/2026-09-21-eventos-mensajes-comidas-design.md)
§1 y §6 · migración base `supabase/migrations/20260921170000_eventos_tipos_cocina.sql` (lo que este
plan reemplaza/extiende) · CLAUDE.md "Probar SQL antes del PR" y "Migraciones: NO se aplican solas a
producción".

**Antes de empezar:**
- Esta rama sale de `master` actualizado.
- Las pruebas de integración y e2e necesitan Postgres real: seguir CLAUDE.md §"Probar SQL antes del
  PR" (banco de pruebas local) o correrlas en CI (`gh run list --workflow "Migraciones producción"` no
  aplica acá — es el job `base-de-datos` de CI el que las corre).

---

## Decisiones de esta pista

- **Reemplazo completo del enum, no una adición.** Los eventos existentes con `retiro`, `charla`,
  `visita` o `reunion` quedan como `otro` (spec §1, regla 1). No hay migración de datos "inteligente"
  porque no hay correspondencia 1 a 1 entre las categorías viejas y las nuevas.
- **`materiales` no cambia de valor, solo de etiqueta visible** (`ETIQUETA_REQUERIMIENTO.materiales`
  pasa de "Solo materiales de cocina" a "Utensilios y materiales"). No se toca el enum
  `requerimiento_cocina` ni la regla de exclusividad.
- **`requiere_otro_texto` es independiente del enum fijo**: se puede combinar con cualquier
  `requiere_cocina` (incluido `materiales`) o ir solo. Igual que `titulo`, se guarda recortado y sin
  quedar en cadena vacía (`null` en su lugar).
- **`eventos_para_cocina()` cambia su filtro**: pasa de `cardinality(requiere_cocina) > 0` a
  `cardinality(requiere_cocina) > 0 or requiere_otro_texto is not null`, para no perder eventos que
  solo piden algo por texto libre.
- **Sin campo nuevo de error propio** (no hace falta `MOL05`): los rechazos son los mismos mecanismos
  que ya existen (`22P02` tipo inválido, `23514` check violado).

---

## Mapa de archivos

```
supabase/migrations/20260921190000_eventos_categorias.sql   nuevo — reemplaza el enum, agrega la columna, recrea la función
lib/calendario/tipos.ts                                      categorías nuevas, etiqueta de materiales, textoPedido(), tipos con requiere_otro_texto
lib/validacion/calendario.ts                                 campo requiere_otro_texto en esquemaEvento
lib/calendario/consultas.ts                                  select incluye requiere_otro_texto
app/(app)/calendario/acciones.ts                              leerFormulario lee requiere_otro_texto
app/(app)/calendario/_componentes/campos-evento.tsx           campo de texto libre nuevo
app/(app)/calendario/_componentes/formulario-evento.tsx       estado + wiring del campo nuevo
tests/unit/calendario/tipos.test.ts                           textoPedido, etiquetas nuevas
tests/unit/calendario/validacion.test.ts                      requiere_otro_texto: vacío→null, máximo, tipos nuevos
tests/integration/calendario.test.ts                          tipos nuevos, tipos viejos rechazados, requiere_otro_texto, filtro de eventos_para_cocina
tests/e2e/calendario.spec.ts                                  labels de tipo nuevos, escenario de pedido libre para Administración
```

---

## Tareas

### Tarea 1: Migración — reemplazar el enum y agregar el pedido libre

**Archivos:**
- Crear: `supabase/migrations/20260921190000_eventos_categorias.sql`
- Test: `tests/integration/calendario.test.ts`

- [ ] **Paso 1: escribir la migración**

```sql
-- =========================================================
-- Calendario: categorías de evento (San Rafael/San Gabriel/San Miguel/Otro)
-- y pedido libre a Administración.
--
-- El enum tipo_evento se reemplaza por completo (no es un valor agregado a
-- uno existente: es un tipo nuevo con el mismo nombre). Los eventos que ya
-- existían con un tipo viejo (retiro/charla/visita/reunion) quedan como
-- 'otro' — no hay correspondencia 1 a 1 entre las categorías viejas y las
-- nuevas.
-- =========================================================

alter type public.tipo_evento rename to tipo_evento_viejo;

create type public.tipo_evento as enum ('san_rafael', 'san_gabriel', 'san_miguel', 'otro');

alter table public.eventos
  alter column tipo drop default,
  alter column tipo type public.tipo_evento using 'otro'::public.tipo_evento,
  alter column tipo set default 'otro';

drop type public.tipo_evento_viejo;

-- ---------- Pedido libre a Administración ----------
-- Independiente de requiere_cocina: se puede combinar con cualquier valor (incluido 'materiales') o
-- ir solo. Mismo patrón que el check de titulo: recortado, sin quedar en cadena vacía.
alter table public.eventos
  add column requiere_otro_texto text,
  add constraint eventos_requiere_otro_texto_valido check (
    requiere_otro_texto is null
    or (requiere_otro_texto = btrim(requiere_otro_texto) and length(requiere_otro_texto) between 1 and 200)
  );

comment on column public.eventos.requiere_otro_texto is
  'Pedido a Administración que no entra en requiere_cocina (ej. "20 sillas extra"). Administración lo ve.';

grant update (requiere_otro_texto) on table public.eventos to authenticated;

-- ---------- eventos_para_cocina(): ahora también el pedido libre ----------
-- Se suelta primero: create or replace no permite cambiar las columnas de un RETURNS TABLE.
drop function public.eventos_para_cocina(date, date);

create function public.eventos_para_cocina(p_desde date, p_hasta date)
returns table (
  id uuid,
  fecha date,
  hora time,
  requiere_cocina public.requerimiento_cocina[],
  requiere_otro_texto text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.fecha, e.hora, e.requiere_cocina, e.requiere_otro_texto
  from public.eventos e
  where (select public.soy_activo())
    and e.fecha between p_desde and p_hasta
    and (cardinality(e.requiere_cocina) > 0 or e.requiere_otro_texto is not null)
  order by e.fecha, e.hora nulls first, e.id
$$;

revoke execute on function public.eventos_para_cocina(date, date) from public, anon;
grant execute on function public.eventos_para_cocina(date, date) to authenticated, service_role;
```

- [ ] **Paso 2: escribir las pruebas de integración que fallan**

En `tests/integration/calendario.test.ts`, dentro de `describe('eventos: tipo y pedidos a la cocina', ...)`:

1. Reemplazar los tres usos de tipos viejos por tipos nuevos:
   - Línea ~245 (`it.each(...)('acepta pedir %j'`): `tipo: 'retiro'` → `tipo: 'san_rafael'`.
   - Línea ~264-274 (`'el Director cambia el tipo...'`): `tipo: 'visita'` → `tipo: 'san_gabriel'`, y el `expect(data).toEqual({ tipo: 'visita', ... })` → `tipo: 'san_gabriel'`.
   - Línea ~276-282 (`it.each(SIN_PERMISO)(...)`): `tipo: 'retiro'` → `tipo: 'san_rafael'` (el `expect` sigue esperando `tipo: 'otro'`, sin cambios, porque a quien no tiene permiso la base no le deja escribir).
2. Agregar, después de `'la base rechaza un tipo desconocido'`:

```ts
  it.each(['retiro', 'charla', 'visita', 'reunion'])('ya no acepta el tipo viejo %s', async (tipo) => {
    const { error } = await admin.from('eventos').insert({ ...base(), tipo })
    expect(error?.code).toBe('22P02')
  })

  it.each(['san_rafael', 'san_gabriel', 'san_miguel', 'otro'])('acepta el tipo %s', async (tipo) => {
    const { error } = await admin.from('eventos').insert({ ...base(), tipo })
    expect(error).toBeNull()
  })
```

3. Agregar, al final del mismo `describe`, un bloque nuevo para el pedido libre:

```ts
describe('eventos: pedido libre a Administración', () => {
  const base = () => ({ titulo: 'Evento de prueba', fecha: FECHA, creado_por: ids.director })

  it('sin indicarlo, queda null', async () => {
    const { data, error } = await admin.from('eventos').insert(base()).select('requiere_otro_texto').single()
    expect(error).toBeNull()
    expect(data).toEqual({ requiere_otro_texto: null })
  })

  it('acepta un texto y lo combina con requiere_cocina (incluido materiales)', async () => {
    const { error } = await admin
      .from('eventos')
      .insert({ ...base(), requiere_cocina: ['materiales'], requiere_otro_texto: '20 sillas extra' })
    expect(error).toBeNull()
  })

  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
    ['sin recortar', '  20 sillas  '],
    ['más de 200 caracteres', 'x'.repeat(201)],
  ])('la base rechaza %s', async (_caso, requiere_otro_texto) => {
    const { error } = await admin.from('eventos').insert({ ...base(), requiere_otro_texto })
    expect(error?.code).toBe('23514')
  })

  it('el Director lo cambia; quien no tiene permiso no', async () => {
    const evento = await crearEventoDePrueba()
    const director = await clienteComo('director')
    const { error } = await director.from('eventos').update({ requiere_otro_texto: 'Traer termos' }).eq('id', evento.id)
    expect(error).toBeNull()

    const otroEvento = await crearEventoDePrueba()
    const residente = await clienteComo('residente')
    await residente.from('eventos').update({ requiere_otro_texto: 'Intento ajeno' }).eq('id', otroEvento.id)
    const { data } = await admin.from('eventos').select('requiere_otro_texto').eq('id', otroEvento.id).single()
    expect(data).toEqual({ requiere_otro_texto: null })
  })
})
```

4. En `describe('eventos_para_cocina: lo único que Administración ve de los eventos', ...)`:
   - En `sembrar()`, cambiar `tipo: 'retiro'` → `tipo: 'san_rafael'`, `tipo: 'reunion'` → `tipo: 'san_gabriel'`, `tipo: 'visita'` → `tipo: 'san_miguel'` (los valores no importan para Administración, pero deben ser válidos).
   - En `'devuelve solo los eventos que piden algo...'`, el `expect(data).toEqual([...])` gana `requiere_otro_texto: null` en el objeto esperado.
   - Agregar un test nuevo:

```ts
  it('un evento que solo pide algo por texto libre también aparece', async () => {
    const { error } = await admin
      .from('eventos')
      .insert({ titulo: 'Visita con pedido especial', fecha: FECHA, hora: '11:00', requiere_cocina: [], requiere_otro_texto: '20 sillas extra', creado_por: ids.director })
    expect(error).toBeNull()
    const cocina = await clienteComo('administracion')
    const { data } = await cocina.rpc('eventos_para_cocina', { p_desde: FECHA, p_hasta: FECHA })
    expect(data).toEqual(
      expect.arrayContaining([expect.objectContaining({ requiere_cocina: [], requiere_otro_texto: '20 sillas extra' })]),
    )
  })
```

- [ ] **Paso 3: correr las pruebas de integración y confirmar que fallan**

Correr: `npx vitest run --project integracion tests/integration/calendario.test.ts` (contra el banco de
pruebas local — ver CLAUDE.md "Probar SQL antes del PR").
Esperado: FALLA — el enum todavía tiene los valores viejos, no existe `requiere_otro_texto`, la
migración de este archivo aún no se aplicó al banco de pruebas.

- [ ] **Paso 4: aplicar la migración al banco de pruebas y volver a correr**

Aplicar la migración nueva al Postgres local de prueba (según cómo esté armado el banco del
scratchpad de esta sesión), después:

Correr: `npx vitest run --project integracion tests/integration/calendario.test.ts`
Esperado: PASA.

- [ ] **Paso 5: commit**

```bash
git add supabase/migrations/20260921190000_eventos_categorias.sql tests/integration/calendario.test.ts
git commit -m "feat(calendario): reemplaza las categorías de evento y agrega el pedido libre a Administración"
```

---

### Tarea 2: `lib/calendario/tipos.ts` — categorías, etiqueta y `textoPedido()`

**Archivos:**
- Modificar: `lib/calendario/tipos.ts`
- Test: `tests/unit/calendario/tipos.test.ts`

- [ ] **Paso 1: escribir las pruebas unitarias que fallan**

En `tests/unit/calendario/tipos.test.ts`:

1. Cambiar la aserción de `materiales` en `'resume lo que debe preparar la cocina'`:
   `expect(textoRequerimientos(['materiales'])).toBe('Solo materiales de cocina')` →
   `expect(textoRequerimientos(['materiales'])).toBe('Utensilios y materiales')`.
2. Actualizar el import y agregar pruebas de `textoPedido` y del campo `requiere_otro_texto`:

```ts
import { describe, expect, it } from 'vitest'
import {
  alternarRequerimiento,
  eventoParaAdministracion,
  textoPedido,
  textoRequerimientos,
  type EventoParaCocina,
} from '@/lib/calendario/tipos'
```

```ts
describe('textoPedido', () => {
  it('solo lista fija', () => {
    expect(textoPedido(['merienda'], null)).toBe('Merienda')
  })

  it('solo texto libre', () => {
    expect(textoPedido([], '20 sillas extra')).toBe('20 sillas extra')
  })

  it('ambos, separados por ·', () => {
    expect(textoPedido(['merienda', 'comida'], '20 sillas extra')).toBe('Merienda y comida · 20 sillas extra')
  })

  it('ninguno: cadena vacía', () => {
    expect(textoPedido([], null)).toBe('')
  })
})
```

3. Actualizar `desdeLaBase` y las aserciones de `eventoParaAdministracion` para incluir `requiere_otro_texto`:

```ts
describe('eventoParaAdministracion', () => {
  const desdeLaBase: EventoParaCocina = {
    id: 'e1',
    fecha: '2026-10-07',
    hora: '16:00:00',
    requiere_cocina: ['merienda', 'comida'],
    requiere_otro_texto: null,
  }

  it('deja fecha, hora y qué preparar; sin tipo, y el título combina lo fijo con lo libre', () => {
    expect(eventoParaAdministracion({ ...desdeLaBase, requiere_otro_texto: '20 sillas extra' })).toEqual({
      id: 'e1',
      fecha: '2026-10-07',
      hora: '16:00:00',
      titulo: 'Merienda y comida · 20 sillas extra',
      tipo: null,
      requiere_cocina: ['merienda', 'comida'],
      requiere_otro_texto: '20 sillas extra',
    })
  })

  it('no arrastra ningún campo que la base no le dio', () => {
    const conDatosDeMas = { ...desdeLaBase, titulo: 'Retiro secreto', tipo: 'retiro' } as EventoParaCocina
    const resultado = eventoParaAdministracion(conDatosDeMas)
    expect(resultado.titulo).toBe('Merienda y comida')
    expect(resultado.tipo).toBeNull()
    expect(JSON.stringify(resultado)).not.toContain('secreto')
  })
})
```

- [ ] **Paso 2: correr las pruebas y confirmar que fallan**

Correr: `npx vitest run --project unit tests/unit/calendario/tipos.test.ts`
Esperado: FALLA — `textoPedido` no existe todavía, `TIPOS_EVENTO`/`ETIQUETA_TIPO` siguen con los
valores viejos, `EventoParaCocina`/`Evento` no tienen `requiere_otro_texto`.

- [ ] **Paso 3: reescribir `lib/calendario/tipos.ts`**

```ts
import type { FechaISO } from '@/lib/fechas'
import type { Enum } from '@/lib/supabase/tipos'

export type TipoEvento = Enum<'tipo_evento'>
export type RequerimientoCocina = Enum<'requerimiento_cocina'>

export const TIPOS_EVENTO: readonly TipoEvento[] = ['san_rafael', 'san_gabriel', 'san_miguel', 'otro']

export const ETIQUETA_TIPO: Record<TipoEvento, string> = {
  san_rafael: 'San Rafael',
  san_gabriel: 'San Gabriel',
  san_miguel: 'San Miguel',
  otro: 'Otro',
}

/** Lo que un evento puede pedirle a la cocina. */
export const REQUERIMIENTOS_COCINA: readonly RequerimientoCocina[] = ['merienda', 'comida', 'materiales']

export const ETIQUETA_REQUERIMIENTO: Record<RequerimientoCocina, string> = {
  merienda: 'Merienda',
  comida: 'Comida',
  materiales: 'Utensilios y materiales',
}

/** Ayuda breve de cada pedido, para quien crea el evento. */
export const AYUDA_REQUERIMIENTO: Record<RequerimientoCocina, string> = {
  merienda: 'Café, bebidas y algo para picar.',
  comida: 'Almuerzo o cena preparados para el evento.',
  materiales: 'Vajilla, mesas, termos: sin preparar comida. No se combina con lo demás.',
}

/**
 * Lo que muestran la cuadrícula y el modal del día.
 *
 * Administración no conoce de qué son los eventos (lib/calendario/consultas.ts): a ella `titulo` le
 * llega como el resumen de lo que debe preparar y `tipo` es null. Nunca hay un título real en un
 * evento de Administración.
 */
export type Evento = {
  id: string
  titulo: string
  fecha: FechaISO
  hora: string | null
  tipo: TipoEvento | null
  requiere_cocina: RequerimientoCocina[]
  requiere_otro_texto: string | null
}

/** Lo único que Administración ve de un evento: cuándo y qué preparar (`eventos_para_cocina`). */
export type EventoParaCocina = {
  id: string
  fecha: FechaISO
  hora: string | null
  requiere_cocina: RequerimientoCocina[]
  requiere_otro_texto: string | null
}

/**
 * Nuevo estado de las casillas al tocar una. "Solo materiales" va solo (regla de la base y de
 * lib/validacion/calendario.ts): marcarlo desmarca lo demás, y marcar lo demás lo desmarca.
 */
export function alternarRequerimiento(
  actuales: readonly RequerimientoCocina[],
  tocado: RequerimientoCocina,
): RequerimientoCocina[] {
  if (actuales.includes(tocado)) return actuales.filter((r) => r !== tocado)
  if (tocado === 'materiales') return ['materiales']
  return [...actuales.filter((r) => r !== 'materiales'), tocado]
}

/** 'Merienda' · 'Merienda y comida' · 'Utensilios y materiales' */
export function textoRequerimientos(requerimientos: readonly RequerimientoCocina[]): string {
  const orden = REQUERIMIENTOS_COCINA.filter((r) => requerimientos.includes(r))
  if (orden.length === 0) return ''
  if (orden.length === 1) return ETIQUETA_REQUERIMIENTO[orden[0]]
  const nombres = orden.map((r) => ETIQUETA_REQUERIMIENTO[r].toLowerCase())
  return `${ETIQUETA_REQUERIMIENTO[orden[0]]} y ${nombres.slice(1).join(' y ')}`
}

/** Lista fija + lo pedido por texto libre: 'Merienda y comida · 20 sillas extra'. */
export function textoPedido(requerimientos: readonly RequerimientoCocina[], otroTexto: string | null): string {
  const fijo = textoRequerimientos(requerimientos)
  if (!otroTexto) return fijo
  return fijo ? `${fijo} · ${otroTexto}` : otroTexto
}

/** El evento tal como lo ve Administración: sin título ni tipo, con lo que debe preparar como texto. */
export function eventoParaAdministracion(e: EventoParaCocina): Evento {
  return {
    id: e.id,
    fecha: e.fecha,
    hora: e.hora,
    titulo: textoPedido(e.requiere_cocina, e.requiere_otro_texto),
    tipo: null,
    requiere_cocina: e.requiere_cocina,
    requiere_otro_texto: e.requiere_otro_texto,
  }
}
```

- [ ] **Paso 4: correr las pruebas y confirmar que pasan**

Correr: `npx vitest run --project unit tests/unit/calendario/tipos.test.ts`
Esperado: PASA.

- [ ] **Paso 5: commit**

```bash
git add lib/calendario/tipos.ts tests/unit/calendario/tipos.test.ts
git commit -m "feat(calendario): categorías San Rafael/San Gabriel/San Miguel/Otro y textoPedido()"
```

---

### Tarea 3: `lib/validacion/calendario.ts` — `requiere_otro_texto` en el esquema

**Archivos:**
- Modificar: `lib/validacion/calendario.ts`
- Test: `tests/unit/calendario/validacion.test.ts`

- [ ] **Paso 1: escribir las pruebas que fallan**

En `tests/unit/calendario/validacion.test.ts`:

1. En `describe('esquemaEvento: tipo y pedidos a la cocina', ...)`, cambiar
   `it.each(['retiro', 'charla', 'visita', 'reunion', 'otro'])('acepta el tipo %s', ...)` a
   `it.each(['san_rafael', 'san_gabriel', 'san_miguel', 'otro'])('acepta el tipo %s', ...)`.
2. Agregar un bloque nuevo:

```ts
describe('esquemaEvento: pedido libre a Administración', () => {
  it('una cadena vacía queda como null', () => {
    expect(esquemaEvento.parse({ ...VALIDO, requiere_otro_texto: '' }).requiere_otro_texto).toBeNull()
  })

  it('recorta el texto', () => {
    expect(esquemaEvento.parse({ ...VALIDO, requiere_otro_texto: '  20 sillas  ' }).requiere_otro_texto).toBe('20 sillas')
  })

  it('acepta hasta 200 caracteres', () => {
    expect(camposInvalidos(esquemaEvento, { ...VALIDO, requiere_otro_texto: 'x'.repeat(200) })).toEqual([])
  })

  it('rechaza más de 200 caracteres', () => {
    expect(camposInvalidos(esquemaEvento, { ...VALIDO, requiere_otro_texto: 'x'.repeat(201) })).toEqual(['requiere_otro_texto'])
  })

  it('sin el campo, también queda null (el formulario puede no mandarlo)', () => {
    expect(esquemaEvento.parse(VALIDO).requiere_otro_texto).toBeNull()
  })
})
```

Nota: `VALIDO` (línea 6 del archivo) no incluye `requiere_otro_texto`; el último caso ya cubre que el
campo sea opcional en la entrada.

- [ ] **Paso 2: correr las pruebas y confirmar que fallan**

Correr: `npx vitest run --project unit tests/unit/calendario/validacion.test.ts`
Esperado: FALLA — el esquema todavía no tiene `requiere_otro_texto` y los tipos viejos ya no son
válidos según la Tarea 2.

- [ ] **Paso 3: agregar el campo al esquema**

En `lib/validacion/calendario.ts`, dentro de `esquemaEvento` (después de `requiere_cocina`):

```ts
  requiere_otro_texto: z
    .string('Pedido inválido.')
    .trim()
    .max(200, 'El pedido puede tener hasta 200 caracteres.')
    .transform((v) => (v === '' ? null : v)),
```

- [ ] **Paso 4: correr las pruebas y confirmar que pasan**

Correr: `npx vitest run --project unit tests/unit/calendario/validacion.test.ts`
Esperado: PASA.

- [ ] **Paso 5: commit**

```bash
git add lib/validacion/calendario.ts tests/unit/calendario/validacion.test.ts
git commit -m "feat(calendario): valida requiere_otro_texto en esquemaEvento"
```

---

### Tarea 4: consultas, server action y formulario — conectar el campo nuevo

Sin prueba unitaria propia (son piezas de conexión delgadas); se verifica con la Tarea 5 (e2e).

**Archivos:**
- Modificar: `lib/calendario/consultas.ts`
- Modificar: `app/(app)/calendario/acciones.ts`
- Modificar: `app/(app)/calendario/_componentes/campos-evento.tsx`
- Modificar: `app/(app)/calendario/_componentes/formulario-evento.tsx`

- [ ] **Paso 1: `lib/calendario/consultas.ts`** — agregar la columna al `select` de Director/Residente:

```ts
  const { data, error } = await supabase
    .from('eventos')
    .select('id, titulo, fecha, hora, tipo, requiere_cocina, requiere_otro_texto')
    .gte('fecha', desde)
```

(Administración ya recibe `requiere_otro_texto` desde la Tarea 1, vía `eventos_para_cocina()` +
`eventoParaAdministracion()` de la Tarea 2 — no hay nada que tocar acá para ese camino.)

- [ ] **Paso 2: `app/(app)/calendario/acciones.ts`** — leer el campo del formulario:

```ts
function leerFormulario(formData: FormData) {
  return {
    id: formData.get('id'),
    titulo: formData.get('titulo'),
    fecha: formData.get('fecha'),
    hora: formData.get('hora') ?? '',
    tipo: formData.get('tipo'),
    requiere_cocina: formData.getAll('requiere_cocina'),
    requiere_otro_texto: formData.get('requiere_otro_texto') ?? '',
  }
}
```

- [ ] **Paso 3: `app/(app)/calendario/_componentes/campos-evento.tsx`** — nuevo campo de texto libre.

Agregar `otroTexto`, `alCambiarOtroTexto` y `errorOtroTexto` a las props de `CamposTipoYCocina`:

```tsx
export function CamposTipoYCocina({
  tipo,
  alCambiarTipo,
  requiere,
  alCambiarRequiere,
  otroTexto,
  alCambiarOtroTexto,
  errorTipo,
  errorCocina,
  errorOtroTexto,
}: {
  tipo: TipoEvento | ''
  alCambiarTipo: (tipo: TipoEvento) => void
  requiere: readonly RequerimientoCocina[]
  alCambiarRequiere: (requiere: RequerimientoCocina[]) => void
  otroTexto: string
  alCambiarOtroTexto: (texto: string) => void
  errorTipo?: string
  errorCocina?: string
  errorOtroTexto?: string
}) {
```

Y, dentro del `<>...</>`, después del `</fieldset>` del pedido a cocina (antes de cerrar el
fragmento):

```tsx
      <div className="field">
        <label htmlFor={`${id}-otro-texto`}>Otro pedido para Administración (opcional)</label>
        <input
          id={`${id}-otro-texto`}
          name="requiere_otro_texto"
          placeholder="Ej. 20 sillas extra"
          maxLength={200}
          value={otroTexto}
          onChange={(e) => alCambiarOtroTexto(e.target.value)}
        />
        <ErrorCampo mensaje={errorOtroTexto} />
      </div>
```

- [ ] **Paso 4: `app/(app)/calendario/_componentes/formulario-evento.tsx`** — estado y wiring en ambos
  formularios.

`CAMPOS_VISIBLES` (línea 13):

```ts
const CAMPOS_VISIBLES = ['titulo', 'fecha', 'hora', 'tipo', 'requiere_cocina', 'requiere_otro_texto'] as const
```

En `FormularioNuevoEvento`: agregar `const [otroTexto, setOtroTexto] = useState('')` junto a los
demás `useState`, resetear `setOtroTexto('')` en el bloque de éxito (junto a `setTitulo('')` etc.), y
pasar `otroTexto={otroTexto} alCambiarOtroTexto={setOtroTexto} errorOtroTexto={campos?.requiere_otro_texto}`
a `<CamposTipoYCocina>`.

En `FormularioEditarEvento`: agregar
`const [otroTexto, setOtroTexto] = useState(evento.requiere_otro_texto ?? '')` junto a los demás
`useState`, y los mismos props nuevos en su `<CamposTipoYCocina>`.

- [ ] **Paso 5: verificación manual rápida**

Correr: `npm run dev`, entrar como Director, abrir un día del calendario, crear un evento con
"Utensilios y materiales" marcado y algo escrito en "Otro pedido para Administración", guardar, y
confirmar en el modal que se guardó. (La verificación automática completa es la Tarea 5.)

- [ ] **Paso 6: commit**

```bash
git add lib/calendario/consultas.ts app/\(app\)/calendario/acciones.ts app/\(app\)/calendario/_componentes/campos-evento.tsx app/\(app\)/calendario/_componentes/formulario-evento.tsx
git commit -m "feat(calendario): formulario y consultas incluyen el pedido libre a Administración"
```

---

### Tarea 5: e2e — labels nuevos y escenario de pedido libre

**Archivos:**
- Modificar: `tests/e2e/calendario.spec.ts`

- [ ] **Paso 1: actualizar los labels de tipo existentes**

1. Línea ~153, dentro de `'el Director elige el tipo y lo que pide a la cocina...'`:
   `await modal.getByLabel('Retiro', { exact: true }).check()` → `await modal.getByLabel('San Rafael', { exact: true }).check()`.
   Línea ~159, el `expect(data).toEqual({ tipo: 'retiro', requiere_cocina: ['merienda'] })` →
   `{ tipo: 'san_rafael', requiere_cocina: ['merienda'] }`.
2. Línea ~137, `const materiales = modal.getByLabel('Solo materiales de cocina', { exact: true })` →
   `const materiales = modal.getByLabel('Utensilios y materiales', { exact: true })`.
3. Línea ~174, dentro de `'sin elegir el tipo el evento no se guarda'`:
   `.getByLabel('Charla o formación')` → `.getByLabel('San Gabriel')` (cualquier radio del grupo sirve
   para esta prueba de validez del navegador; con el enum nuevo "Charla o formación" ya no existe).
4. Línea ~188-189, dentro de `'Administración ve lo que la cocina debe preparar, sin título ni tipo'`:
   `tipo: 'retiro'` → `tipo: 'san_rafael'`, `tipo: 'reunion'` → `tipo: 'san_gabriel'`.

- [ ] **Paso 2: agregar el escenario de pedido libre**

Después del test `'Administración ve lo que la cocina debe preparar, sin título ni tipo'`:

```ts
test('Administración ve el pedido libre aunque el evento no pida nada de la lista fija', async ({ page }) => {
  const ids = await asegurarUsuariosPrueba()
  const hoy = fechaISOEn(new Date())
  const { error } = await clienteAdminPrueba()
    .from('eventos')
    .insert({
      titulo: 'Visita con pedido especial',
      fecha: hoy,
      hora: '11:00',
      tipo: 'san_miguel',
      requiere_cocina: [],
      requiere_otro_texto: '20 sillas extra',
      creado_por: ids.director,
    })
  expect(error).toBeNull()

  await iniciarSesion(page, 'administracion')
  await page.goto('/calendario')
  await page.locator(`.cal-day[data-fecha="${hoy}"]`).click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByText('20 sillas extra')).toBeVisible()

  const html = await page.content()
  expect(html, '"Visita con pedido especial" no debería llegar a Administración').not.toContain('Visita con pedido especial')
})
```

- [ ] **Paso 3: correr los e2e y confirmar que fallan antes de la Tarea 4, pasan después**

Correr: `npx playwright test tests/e2e/calendario.spec.ts` (contra Supabase local, ver README).
Esperado: si las Tareas 1-4 ya están aplicadas, PASA. Si se corre este paso antes de la Tarea 4 (sin
el campo en el formulario/consultas), el primer test de esta tarea falla al no encontrar el campo
"Otro pedido para Administración".

- [ ] **Paso 4: commit**

```bash
git add tests/e2e/calendario.spec.ts
git commit -m "test(calendario): e2e de categorías nuevas y pedido libre a Administración"
```

---

### Tarea 6: tipos de Supabase y apertura del PR

- [ ] **Paso 1: push de la rama y CI**

```bash
git push -u origin HEAD
```

- [ ] **Paso 2: descargar `database.types.ts` generado por CI** (sin Docker local, per CLAUDE.md /
  índice de la Fase 0 §5.3):

```bash
gh run download "$(gh run list --branch "$(git branch --show-current)" --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId')" -n database-types -D lib/supabase
```

- [ ] **Paso 3: revisar el diff de `database.types.ts`**, confirmar que solo cambian `tipo_evento` y
  la columna `requiere_otro_texto`, y commitear:

```bash
git add lib/supabase/database.types.ts
git commit -m "chore(calendario): regenera database.types.ts"
git push
```

- [ ] **Paso 4: abrir el PR** (`gh pr create`), confirmar que el job `base-de-datos` de CI está en
  verde (relanzar con `gh run rerun --failed` si falla por infraestructura del runner, no por el
  código — ver CLAUDE.md).

**No fusionar sin que el usuario lo revise y mergee** (regla del repo: `gh pr merge` no se usa desde
esta sesión salvo pedido explícito).
