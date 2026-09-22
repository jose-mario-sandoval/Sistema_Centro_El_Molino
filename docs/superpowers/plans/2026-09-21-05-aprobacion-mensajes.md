# Aprobación de mensajes — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** los mensajes de Residentes quedan `pendiente` hasta que el Director los aprueba o
rechaza (con motivo opcional); los del Director se publican directo. Aplica también a respuestas. El
autor ve su propio mensaje marcado mientras espera; si lo rechazan, puede corregirlo y reenviarlo.

**Arquitectura:** columna `estado` en `mensajes`, forzada por un trigger `before insert or update`
según el rol de quien escribe/edita (nunca por lo que mande el navegador). La política de lectura ya
existente se reemplaza por una que filtra por `estado`, salvo para el autor y el Director. El cambio
no trivial es tiempo real: hoy `leerEvento()` ignora todos los `UPDATE` de `mensajes` — aprobar o
rechazar es un `UPDATE`, así que hace falta manejarlo, incluyendo el caso de que un mensaje que antes
era invisible (pendiente) se vuelva visible para otros al aprobarse.

**Stack:** Next.js (App Router), TypeScript, `@supabase/supabase-js` (Realtime), zod 4, Vitest,
Playwright, Postgres 17.

**Referencias:** spec [`docs/superpowers/specs/2026-09-21-eventos-mensajes-comidas-design.md`](../specs/2026-09-21-eventos-mensajes-comidas-design.md)
§5 · migración base `supabase/migrations/20260917125406_mensajes.sql` · próximo código de error libre:
no hace falta ninguno nuevo (ver Decisiones).

**Antes de empezar:** pruebas de integración y e2e necesitan Supabase local o CI.

---

## Decisiones de esta pista

- **El estado lo decide un trigger, no el cliente.** `before insert`: `pendiente` salvo que quien
  publica sea Director (`aprobado`). `before update`: si quien edita no es Director, fuerza
  `estado := 'pendiente'` y `motivo_rechazo := null` sin importar qué mande — así el autor no puede
  autoaprobarse editando, y no hace falta que la acción del servidor calcule nada de esto.
- **Sin código de error propio.** No hay ninguna situación nueva que deba rechazarse con un mensaje
  especial: RLS ya devuelve 0 filas afectadas para una edición no autorizada (mismo patrón que
  `editarEvento`), y el trigger nunca lanza una excepción, solo sobrescribe.
- **`publicarMensaje`/`responderMensaje` no cambian.** El `INSERT` no manda `estado`: la columna tiene
  default `'pendiente'` y el trigger decide si corresponde `'aprobado'`. Cero cambios en esas dos
  acciones.
- **Reacciones**: su política de lectura pasa a exigir que el mensaje asociado sea visible para quien
  lee (spec §5, hallazgo de la revisión del spec) — hoy no mira el mensaje en absoluto.
- **La parte delicada: tiempo real de un `UPDATE`.** `leerEvento()` hoy solo traduce `INSERT`/`DELETE`
  de `mensajes`. Al aprobar un mensaje ajeno pendiente, Postgres Changes le manda el evento `UPDATE` a
  cualquiera cuya RLS ahora sí lo deje ver — pero esa persona **nunca recibió el `INSERT` original**
  (estaba pendiente, invisible). Por eso la función nueva (`aplicarActualizacionMensaje`) no puede
  asumir que el mensaje ya está en el feed local: si no está, lo inserta (como una publicación o como
  respuesta bajo su padre, si el padre está cargado); si está, lo actualiza. Si el padre de una
  respuesta recién visible no está cargado (el padre mismo sigue sin ser visible, o esta página no lo
  trajo), la respuesta no se puede mostrar todavía — aparecerá sola al recargar cuando su padre
  también lo esté. No es un error, es la consecuencia natural de que las respuestas viajan anidadas
  bajo su publicación.
- **`aplicarInsercionMensaje` NO sirve para esto.** Su chequeo de idempotencia (`yaEsta`) compara
  `creadoEn`, que nunca cambia en un `UPDATE` — reusarlo tal cual haría que la función piense "esto ya
  se aplicó" y **descarte** el cambio de estado la primera vez que llega. Hace falta una función
  distinta.
- **La cola de moderación del Director es una pestaña nueva** (`?vista=pendientes`), con el mismo
  patrón que ya existe para `?vista=registro`.

---

## Mapa de archivos

```
supabase/migrations/20260921220000_aprobacion_mensajes.sql   nuevo — estado_mensaje, trigger, políticas
lib/mensajes/feed.ts                                          tipos + aplicarActualizacionMensaje()
lib/mensajes/tiempo-real.ts                                    filaMensaje() + rama UPDATE de leerEvento()
lib/mensajes/consulta-feed.ts                                  COLUMNAS_FEED incluye estado/motivo_rechazo
lib/mensajes/consultas.ts                                      listarMensajesPendientes()
lib/validacion/mensajes.ts                                     esquemaModeracion, esquemaEdicionPropia
app/(app)/mensajes/acciones.ts                                  moderarMensaje, editarMensajePropio
app/(app)/mensajes/page.tsx                                     pestaña "Pendientes"
app/(app)/mensajes/_componentes/cola-moderacion.tsx             nuevo — lista de pendientes, aprobar/rechazar
app/(app)/mensajes/_componentes/tarjeta-mensaje.tsx             insignia de estado + editar y reenviar
app/(app)/mensajes/_componentes/formulario-editar-propio.tsx    nuevo
app/(app)/mensajes/_componentes/feed-mensajes.tsx                el mensaje optimista propio incluye estado/motivo_rechazo
tests/unit/mensajes/feed.test.ts                                aplicarActualizacionMensaje()
tests/unit/mensajes/tiempo-real.test.ts                         rama UPDATE de leerEvento()
tests/unit/mensajes/validacion.test.ts                          esquemaModeracion, esquemaEdicionPropia
tests/integration/mensajes.test.ts                               estado forzado, políticas, reacciones
tests/e2e/mensajes.spec.ts                                       rechazo → edición → reenvío → aprobación
```

---

## Tareas

### Tarea 1: migración — `estado`, trigger, políticas

**Archivos:**
- Crear: `supabase/migrations/20260921220000_aprobacion_mensajes.sql`
- Test: `tests/integration/mensajes.test.ts`

- [ ] **Paso 1: escribir la migración**

```sql
-- =========================================================
-- Aprobación de mensajes: los de Residentes quedan pendientes hasta que el
-- Director los aprueba o rechaza; los del Director se publican directo. El
-- estado lo fuerza un trigger, nunca lo que mande el cliente.
-- =========================================================

create type public.estado_mensaje as enum ('pendiente', 'aprobado', 'rechazado');

alter table public.mensajes
  add column estado public.estado_mensaje not null default 'pendiente',
  add column motivo_rechazo text;

alter table public.mensajes
  add constraint mensajes_motivo_rechazo_valido check (
    motivo_rechazo is null or (motivo_rechazo = btrim(motivo_rechazo) and length(motivo_rechazo) between 1 and 500)
  );

comment on column public.mensajes.estado is 'Lo fuerza mensajes_forzar_estado; el cliente no lo controla.';

-- ---------- El estado lo decide el servidor ----------
create function public.mensajes_forzar_estado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.estado := case when (select public.mi_rol()) = 'director' then 'aprobado' else 'pendiente' end;
    new.motivo_rechazo := null;
  elsif (select public.mi_rol()) is distinct from 'director' then
    -- "is distinct from", no "<>": mi_rol() devuelve null si la cuenta está desactivada, y
    -- `null <> 'director'` es null (ni true ni false) — el elsif no entraría y el estado que mandó
    -- el cliente pasaría tal cual. Con cuentas activas da lo mismo; con una recién desactivada
    -- (JWT todavía válido) es la diferencia entre bloquear la autoaprobación o no.
    -- El autor solo llega acá para corregir un rechazo (la política de UPDATE se lo exige):
    -- vuelve a pendiente sin importar qué mande, y no puede autoaprobarse.
    new.estado := 'pendiente';
    new.motivo_rechazo := null;
  end if;
  return new;
end;
$$;

create trigger mensajes_forzar_estado
  before insert or update on public.mensajes
  for each row execute function public.mensajes_forzar_estado();

-- ---------- Quién ve qué ----------
drop policy "mensajes: lectura para usuarios activos" on public.mensajes;

create policy "mensajes: lectura según estado"
  on public.mensajes for select
  to authenticated
  using (
    (select public.soy_activo())
    and (estado = 'aprobado' or autor_id = (select auth.uid()) or (select public.mi_rol()) = 'director')
  );

-- Antes no miraba el mensaje al que pertenece: una reacción a un mensaje pendiente/rechazado quedaba
-- visible igual (sin texto, pero delatando que ese mensaje existe).
drop policy "reacciones: lectura para usuarios activos" on public.reacciones;

create policy "reacciones: lectura según visibilidad del mensaje"
  on public.reacciones for select
  to authenticated
  using (
    (select public.soy_activo())
    and exists (
      select 1 from public.mensajes m
      where m.id = reacciones.mensaje_id
        and (m.estado = 'aprobado' or m.autor_id = (select auth.uid()) or (select public.mi_rol()) = 'director')
    )
  );

-- ---------- Edición: el Director modera, el autor corrige un rechazo ----------
grant update (texto, estado, motivo_rechazo) on table public.mensajes to authenticated;

create policy "mensajes: el Director modera"
  on public.mensajes for update
  to authenticated
  using ((select public.mi_rol()) = 'director')
  with check ((select public.mi_rol()) = 'director');

-- soy_activo() de más, además del trigger: mismo motivo que "is distinct from" arriba, y consistente
-- con el resto del archivo (todas las demás políticas de mensajes ya la exigen).
create policy "mensajes: el autor corrige un rechazo"
  on public.mensajes for update
  to authenticated
  using ((select public.soy_activo()) and autor_id = (select auth.uid()) and estado = 'rechazado')
  with check ((select public.soy_activo()) and autor_id = (select auth.uid()));
```

- [ ] **Paso 2: escribir las pruebas de integración**

Agregar a `tests/integration/mensajes.test.ts` (usa los helpers ya presentes en el archivo: `admin`,
`ids`, `clienteComo`, y el patrón de sembrar un mensaje con `admin.from('mensajes').insert(...)`):

```ts
describe('aprobación de mensajes', () => {
  async function mensajeDeResidente() {
    const { data, error } = await admin
      .from('mensajes')
      .insert({ autor_id: ids.residente, texto: 'Mensaje de prueba' })
      .select('id, estado')
      .single()
    if (error) throw error
    return data
  }

  it('un Residente publica y queda pendiente; el Director publica y queda aprobado', async () => {
    const residente = await clienteComo('residente')
    const { data: propio } = await residente.from('mensajes').insert({ autor_id: ids.residente, texto: 'Hola' }).select('estado').single()
    expect(propio!.estado).toBe('pendiente')

    const director = await clienteComo('director')
    const { data: delDirector } = await director.from('mensajes').insert({ autor_id: ids.director, texto: 'Aviso' }).select('estado').single()
    expect(delDirector!.estado).toBe('aprobado')
  })

  it('el cliente no puede autoaprobarse mandando estado en el insert', async () => {
    const residente = await clienteComo('residente')
    const { data } = await residente
      .from('mensajes')
      // @ts-expect-error -- estado no debería poder mandarse, pero probamos que aunque se intente, no sirve.
      .insert({ autor_id: ids.residente, texto: 'Truco', estado: 'aprobado' })
      .select('estado')
      .single()
    expect(data!.estado).toBe('pendiente')
  })

  it('quien no es el autor ni el Director no ve un mensaje pendiente', async () => {
    const mensaje = await mensajeDeResidente()
    const otroResidente = await clienteComo('residente2')
    const { data } = await otroResidente.from('mensajes').select('id').eq('id', mensaje.id)
    expect(data).toEqual([])
  })

  it('el autor sí ve su propio mensaje pendiente; el Director también', async () => {
    const mensaje = await mensajeDeResidente()
    const residente = await clienteComo('residente')
    const { data: propio } = await residente.from('mensajes').select('id').eq('id', mensaje.id)
    expect(propio).toEqual([{ id: mensaje.id }])
    const director = await clienteComo('director')
    const { data: delDirector } = await director.from('mensajes').select('id').eq('id', mensaje.id)
    expect(delDirector).toEqual([{ id: mensaje.id }])
  })

  it('el Director aprueba, edita el texto y pone un mensaje en rechazado con motivo', async () => {
    const mensaje = await mensajeDeResidente()
    const director = await clienteComo('director')
    const { error } = await director.from('mensajes').update({ estado: 'aprobado', texto: 'Corregido por el Director' }).eq('id', mensaje.id)
    expect(error).toBeNull()
    const { data } = await admin.from('mensajes').select('estado, texto').eq('id', mensaje.id).single()
    expect(data).toEqual({ estado: 'aprobado', texto: 'Corregido por el Director' })

    const otro = await mensajeDeResidente()
    await director.from('mensajes').update({ estado: 'rechazado', motivo_rechazo: 'Muy largo' }).eq('id', otro.id)
    const { data: rechazado } = await admin.from('mensajes').select('estado, motivo_rechazo').eq('id', otro.id).single()
    expect(rechazado).toEqual({ estado: 'rechazado', motivo_rechazo: 'Muy largo' })
  })

  it('una vez aprobado, todos lo ven', async () => {
    const mensaje = await mensajeDeResidente()
    const director = await clienteComo('director')
    await director.from('mensajes').update({ estado: 'aprobado' }).eq('id', mensaje.id)
    const otroResidente = await clienteComo('residente2')
    const { data } = await otroResidente.from('mensajes').select('id').eq('id', mensaje.id)
    expect(data).toEqual([{ id: mensaje.id }])
  })

  it('el autor corrige un mensaje rechazado y vuelve a pendiente automáticamente', async () => {
    const mensaje = await mensajeDeResidente()
    const director = await clienteComo('director')
    await director.from('mensajes').update({ estado: 'rechazado', motivo_rechazo: 'Corregí esto' }).eq('id', mensaje.id)

    const residente = await clienteComo('residente')
    const { error } = await residente.from('mensajes').update({ texto: 'Ya corregido' }).eq('id', mensaje.id)
    expect(error).toBeNull()
    const { data } = await admin.from('mensajes').select('estado, texto, motivo_rechazo').eq('id', mensaje.id).single()
    expect(data).toEqual({ estado: 'pendiente', texto: 'Ya corregido', motivo_rechazo: null })
  })

  it('el autor no puede editar un mensaje pendiente ni uno aprobado (sin pasar por rechazado)', async () => {
    const mensaje = await mensajeDeResidente() // pendiente
    const residente = await clienteComo('residente')
    const { data: sinTocarPendiente } = await residente.from('mensajes').update({ texto: 'Intento' }).eq('id', mensaje.id).select('id')
    expect(sinTocarPendiente).toEqual([])

    const director = await clienteComo('director')
    await director.from('mensajes').update({ estado: 'aprobado' }).eq('id', mensaje.id)
    const { data: sinTocarAprobado } = await residente.from('mensajes').update({ texto: 'Intento 2' }).eq('id', mensaje.id).select('id')
    expect(sinTocarAprobado).toEqual([])
  })

  it('quien no es el autor ni el Director no puede editar nada', async () => {
    const mensaje = await mensajeDeResidente()
    const director = await clienteComo('director')
    await director.from('mensajes').update({ estado: 'rechazado' }).eq('id', mensaje.id)
    const otroResidente = await clienteComo('residente2')
    const { data } = await otroResidente.from('mensajes').update({ texto: 'Ajeno' }).eq('id', mensaje.id).select('id')
    expect(data).toEqual([])
  })

  it('una reacción a un mensaje pendiente no es visible para terceros', async () => {
    const mensaje = await mensajeDeResidente()
    const { error: errorReaccion } = await admin.from('reacciones').insert({ mensaje_id: mensaje.id, usuario_id: ids.director })
    expect(errorReaccion).toBeNull()
    const otroResidente = await clienteComo('residente2')
    const { data } = await otroResidente.from('reacciones').select('mensaje_id').eq('mensaje_id', mensaje.id)
    expect(data).toEqual([])
  })
})
```

- [ ] **Paso 3: correr, confirmar que falla, aplicar la migración, confirmar que pasa**

Correr: `npx vitest run --project integracion tests/integration/mensajes.test.ts -t "aprobación de mensajes"`
Esperado: FALLA (columna/trigger/políticas no existen) → aplicar migración → PASA.

- [ ] **Paso 4: commit**

```bash
git add supabase/migrations/20260921220000_aprobacion_mensajes.sql tests/integration/mensajes.test.ts
git commit -m "feat(mensajes): estado de aprobación, forzado por trigger (esquema)"
```

---

### Tarea 2: `lib/mensajes/feed.ts` — tipos y `aplicarActualizacionMensaje()`

**Archivos:**
- Modificar: `lib/mensajes/feed.ts`
- Test: `tests/unit/mensajes/feed.test.ts`

- [ ] **Paso 1: escribir las pruebas que fallan**

Agregar a `tests/unit/mensajes/feed.test.ts` (ajustar el import del encabezado para incluir
`aplicarActualizacionMensaje`; los fixtures de `MensajeFila`/`Publicacion` que ya usa el archivo
necesitan ahora `estado`/`motivo_rechazo` — `motivoRechazo` en el caso de `Publicacion`/`Respuesta` —
agregarlos con `estado: 'aprobado', motivo_rechazo: null` por defecto en los helpers de fixture
existentes):

```ts
describe('aplicarActualizacionMensaje', () => {
  const base = { id: 'm1', autor_id: 'u1', padre_id: null, texto: 'Hola', creado_en: '2026-01-01T00:00:00.000000+00:00' }

  it('actualiza el estado de una publicación que ya estaba en el feed', () => {
    const feed = [{ id: 'm1', autorId: 'u1', texto: 'Hola', creadoEn: base.creado_en, estado: 'pendiente' as const, motivoRechazo: null, reacciones: [], respuestas: [] }]
    const siguiente = aplicarActualizacionMensaje(feed, { ...base, estado: 'aprobado', motivo_rechazo: null })
    expect(siguiente[0].estado).toBe('aprobado')
  })

  it('un mensaje que se vuelve visible por primera vez (no estaba en el feed) se inserta', () => {
    const siguiente = aplicarActualizacionMensaje([], { ...base, estado: 'aprobado', motivo_rechazo: null })
    expect(siguiente).toEqual([{ id: 'm1', autorId: 'u1', texto: 'Hola', creadoEn: base.creado_en, estado: 'aprobado', motivoRechazo: null, reacciones: [], respuestas: [] }])
  })

  it('una respuesta que se vuelve visible se agrega bajo su padre si el padre está cargado', () => {
    const feed = [{ id: 'padre', autorId: 'u2', texto: 'Publicación', creadoEn: '2026-01-01T00:00:00.000000+00:00', estado: 'aprobado' as const, motivoRechazo: null, reacciones: [], respuestas: [] }]
    const siguiente = aplicarActualizacionMensaje(feed, { ...base, id: 'r1', padre_id: 'padre', estado: 'aprobado', motivo_rechazo: null })
    expect(siguiente[0].respuestas).toHaveLength(1)
    expect(siguiente[0].respuestas[0].id).toBe('r1')
  })

  it('una respuesta cuyo padre no está cargado no rompe nada: el feed queda igual', () => {
    const siguiente = aplicarActualizacionMensaje([], { ...base, id: 'r1', padre_id: 'padre-no-cargado', estado: 'aprobado', motivo_rechazo: null })
    expect(siguiente).toEqual([])
  })

  it('actualiza una respuesta que ya estaba cargada', () => {
    const feed = [{ id: 'padre', autorId: 'u2', texto: 'Publicación', creadoEn: '2026-01-01T00:00:00.000000+00:00', estado: 'aprobado' as const, motivoRechazo: null, reacciones: [], respuestas: [{ id: 'r1', autorId: 'u1', texto: 'Vieja', creadoEn: base.creado_en, estado: 'pendiente' as const, motivoRechazo: null }] }]
    const siguiente = aplicarActualizacionMensaje(feed, { ...base, id: 'r1', padre_id: 'padre', texto: 'Corregida', estado: 'rechazado', motivo_rechazo: 'Ofensivo' })
    expect(siguiente[0].respuestas[0]).toEqual({ id: 'r1', autorId: 'u1', texto: 'Corregida', creadoEn: base.creado_en, estado: 'rechazado', motivoRechazo: 'Ofensivo' })
  })
})
```

- [ ] **Paso 2: correr y confirmar que falla**

Correr: `npx vitest run --project unit tests/unit/mensajes/feed.test.ts`
Esperado: FALLA — `aplicarActualizacionMensaje` no existe, y los tipos actuales no tienen
`estado`/`motivoRechazo`.

- [ ] **Paso 3: implementar**

En `lib/mensajes/feed.ts`:

1. `MensajeFila` gana las dos columnas:
   ```ts
   export type EstadoMensaje = 'pendiente' | 'aprobado' | 'rechazado'
   export type MensajeFila = Pick<
     Tabla<'mensajes'>,
     'id' | 'autor_id' | 'padre_id' | 'texto' | 'creado_en' | 'estado' | 'motivo_rechazo'
   >
   ```
2. `Respuesta` gana los mismos datos en camelCase:
   ```ts
   export type Respuesta = { id: string; autorId: string; texto: string; creadoEn: string; estado: EstadoMensaje; motivoRechazo: string | null }
   ```
3. `aRespuesta()`:
   ```ts
   function aRespuesta(fila: MensajeFila): Respuesta {
     return {
       id: fila.id,
       autorId: fila.autor_id,
       texto: fila.texto,
       creadoEn: fila.creado_en,
       estado: fila.estado,
       motivoRechazo: fila.motivo_rechazo,
     }
   }
   ```
4. Agregar, después de `aplicarInsercionMensaje`:
   ```ts
   /**
    * Evento UPDATE de `mensajes` (aprobar/rechazar/editar). A diferencia de una inserción, no se puede
    * asumir que el mensaje ya está en el feed local: quien lo recibe puede estar viéndolo por primera
    * vez recién ahora que se volvió visible (antes estaba pendiente). Si el padre de una respuesta
    * recién visible no está cargado, no hay nada que hacer todavía — aparecerá al recargar cuando el
    * padre también sea visible.
    */
   export function aplicarActualizacionMensaje(feed: Publicacion[], fila: MensajeFila): Publicacion[] {
     const padreId = fila.padre_id
     if (padreId === null) {
       const existe = feed.some((p) => p.id === fila.id)
       const siguiente = existe
         ? feed.map((p) => (p.id === fila.id ? { ...p, ...aRespuesta(fila) } : p))
         : [...feed, aPublicacion(fila)]
       return siguiente.sort(compararPublicaciones)
     }
     const padre = feed.find((p) => p.id === padreId)
     if (!padre) return feed
     const existeRespuesta = padre.respuestas.some((r) => r.id === fila.id)
     const respuestas = existeRespuesta
       ? padre.respuestas.map((r) => (r.id === fila.id ? { ...r, ...aRespuesta(fila) } : r))
       : [...padre.respuestas, aRespuesta(fila)].sort(compararRespuestas)
     return feed.map((p) => (p.id === padreId ? { ...p, respuestas } : p))
   }
   ```

- [ ] **Paso 4: correr y confirmar que pasa**

Correr: `npx vitest run --project unit tests/unit/mensajes/feed.test.ts`
Esperado: PASA. Si otros tests del mismo archivo (los que ya existían) fallan por faltarles
`estado`/`motivoRechazo` en sus fixtures, agregarlos (`estado: 'aprobado', motivo_rechazo: null` /
`motivoRechazo: null` según corresponda) sin cambiar lo que cada test verifica.

- [ ] **Paso 5: arreglar el mensaje optimista de `feed-mensajes.tsx`**

Este paso es **obligatorio para que compile**, no opcional: `MensajeFila` ahora exige `estado` y
`motivo_rechazo`, y `app/(app)/mensajes/_componentes/feed-mensajes.tsx` arma uno a mano al publicar
(inserción optimista, antes de que llegue la confirmación del servidor) — algo como
`{ id, autor_id: usuario.id, padre_id: padreId, texto, creado_en: new Date().toISOString() }`, sin
esos dos campos. Ubicar esa construcción (función `agregarPropio` o como se llame) y agregarle:

```ts
estado: usuario.rol === 'director' ? 'aprobado' : 'pendiente',
motivo_rechazo: null,
```

No es solo para que tipe: si se dejara `estado: 'aprobado'` a secas, un Residente vería su propio
mensaje como ya aprobado por un instante (hasta que el evento de tiempo real lo corrija a
`'pendiente'`), mostrando y ocultando la insignia de "Esperando aprobación" en un parpadeo.

- [ ] **Paso 6: commit**

```bash
git add lib/mensajes/feed.ts tests/unit/mensajes/feed.test.ts app/\(app\)/mensajes/_componentes/feed-mensajes.tsx
git commit -m "feat(mensajes): estado en el feed y aplicarActualizacionMensaje()"
```

---

### Tarea 3: `lib/mensajes/tiempo-real.ts` — rama UPDATE

**Archivos:**
- Modificar: `lib/mensajes/tiempo-real.ts`
- Test: `tests/unit/mensajes/tiempo-real.test.ts`

- [ ] **Paso 1: escribir las pruebas que fallan**

Agregar a `tests/unit/mensajes/tiempo-real.test.ts` (el test existente que espera `null` para
`eventType: 'UPDATE'` de `mensajes` debe **quitarse o reemplazarse**, ya no aplica):

```ts
describe('leerEvento: UPDATE de mensajes', () => {
  const filaBase = {
    id: 'm1',
    autor_id: 'u1',
    padre_id: null,
    texto: 'Hola',
    creado_en: '2026-01-01T00:00:00.000000+00:00',
    estado: 'aprobado',
    motivo_rechazo: null,
  }

  it('traduce un UPDATE a un cambio del feed', () => {
    const resultado = leerEvento({ table: 'mensajes', eventType: 'UPDATE', new: filaBase, old: {} })
    expect(resultado?.autorId).toBe('u1')
    const siguiente = resultado!.cambio([])
    expect(siguiente).toEqual([{ id: 'm1', autorId: 'u1', texto: 'Hola', creadoEn: filaBase.creado_en, estado: 'aprobado', motivoRechazo: null, reacciones: [], respuestas: [] }])
  })

  it('un estado desconocido se ignora (fila inválida)', () => {
    const resultado = leerEvento({ table: 'mensajes', eventType: 'UPDATE', new: { ...filaBase, estado: 'algo-raro' }, old: {} })
    expect(resultado).toBeNull()
  })

  it('con errors (RLS lo bloqueó), se ignora', () => {
    const resultado = leerEvento({ table: 'mensajes', eventType: 'UPDATE', new: filaBase, old: {}, errors: ['Error 401'] })
    expect(resultado).toBeNull()
  })
})
```

- [ ] **Paso 2: correr y confirmar que falla**

Correr: `npx vitest run --project unit tests/unit/mensajes/tiempo-real.test.ts`
Esperado: FALLA — `leerEvento` sigue devolviendo `null` para `UPDATE` de `mensajes`.

- [ ] **Paso 3: implementar**

En `lib/mensajes/tiempo-real.ts`:

1. Import: agregar `aplicarActualizacionMensaje` al import de `@/lib/mensajes/feed`.
2. `filaMensaje()`:
   ```ts
   function filaMensaje(datos: Record<string, unknown>): MensajeFila | null {
     const { id, autor_id, padre_id, texto, creado_en, estado, motivo_rechazo } = datos
     if (!esTexto(id) || !esTexto(autor_id) || typeof texto !== 'string' || !esTexto(creado_en)) return null
     if (padre_id !== null && !esTexto(padre_id)) return null
     if (estado !== 'pendiente' && estado !== 'aprobado' && estado !== 'rechazado') return null
     if (motivo_rechazo !== null && typeof motivo_rechazo !== 'string') return null
     return { id, autor_id, padre_id, texto, creado_en, estado, motivo_rechazo }
   }
   ```
3. Rama `mensajes` de `leerEvento()` (agregar el bloque `UPDATE` entre `INSERT` y `DELETE`):
   ```ts
   if (evento.eventType === 'UPDATE') {
     const fila = filaMensaje(evento.new)
     if (!fila) return null
     return { cambio: (feed) => aplicarActualizacionMensaje(feed, fila), autorId: fila.autor_id }
   }
   ```

- [ ] **Paso 4: correr y confirmar que pasa**

Correr: `npx vitest run --project unit tests/unit/mensajes/tiempo-real.test.ts`
Esperado: PASA (incluido el test viejo que quitaba/reemplazaba la aserción de `null` para `UPDATE`).

- [ ] **Paso 5: commit**

```bash
git add lib/mensajes/tiempo-real.ts tests/unit/mensajes/tiempo-real.test.ts
git commit -m "feat(mensajes): tiempo real traduce el UPDATE de aprobar/rechazar"
```

---

### Tarea 4: `lib/mensajes/consulta-feed.ts` — traer `estado`/`motivo_rechazo`

**Archivos:**
- Modificar: `lib/mensajes/consulta-feed.ts`

Sin prueba unitaria propia (es una cadena de consulta; ya la ejercitan los tests de integración de la
Tarea 1 indirectamente, y el e2e de la Tarea 7 confirma el resultado de punta a punta).

- [ ] **Paso 1: ampliar `COLUMNAS_FEED` y `todasLasRespuestas`**

```ts
const COLUMNAS_FEED =
  'id, autor_id, padre_id, texto, creado_en, estado, motivo_rechazo, reacciones(usuario_id), ' +
  'respuestas:mensajes!padre_id(id, autor_id, padre_id, texto, creado_en, estado, motivo_rechazo)'
```

Y en `todasLasRespuestas`, la línea `.select('id, autor_id, padre_id, texto, creado_en')` gana
`, estado, motivo_rechazo`.

- [ ] **Paso 2: commit**

```bash
git add lib/mensajes/consulta-feed.ts
git commit -m "feat(mensajes): la consulta del feed trae estado y motivo_rechazo"
```

---

### Tarea 5: validación zod — moderar y corregir un rechazo

**Archivos:**
- Modificar: `lib/validacion/mensajes.ts`
- Test: `tests/unit/mensajes/validacion.test.ts`

- [ ] **Paso 1: escribir las pruebas que fallan**

```ts
import { esquemaEdicionPropia, esquemaModeracion /* + lo que ya importaba */ } from '@/lib/validacion/mensajes'

const ID = '3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c'

describe('esquemaModeracion', () => {
  it('acepta aprobar sin texto ni motivo', () => {
    expect(esquemaModeracion.parse({ id: ID, estado: 'aprobado' })).toEqual({ id: ID, estado: 'aprobado' })
  })

  it('acepta rechazar con motivo', () => {
    expect(esquemaModeracion.parse({ id: ID, estado: 'rechazado', motivoRechazo: 'Muy largo' }).motivoRechazo).toBe('Muy largo')
  })

  it('acepta editar el texto junto con aprobar', () => {
    expect(esquemaModeracion.parse({ id: ID, estado: 'aprobado', texto: 'Corregido' }).texto).toBe('Corregido')
  })

  it('rechaza un estado que no sea aprobado/rechazado', () => {
    const resultado = esquemaModeracion.safeParse({ id: ID, estado: 'pendiente' })
    expect(resultado.success).toBe(false)
  })

  it('rechaza un motivo de más de 500 caracteres', () => {
    const resultado = esquemaModeracion.safeParse({ id: ID, estado: 'rechazado', motivoRechazo: 'x'.repeat(501) })
    expect(resultado.success).toBe(false)
  })
})

describe('esquemaEdicionPropia', () => {
  it('acepta id y texto', () => {
    expect(esquemaEdicionPropia.parse({ id: ID, texto: 'Corregido' })).toEqual({ id: ID, texto: 'Corregido' })
  })

  it('rechaza texto vacío', () => {
    expect(esquemaEdicionPropia.safeParse({ id: ID, texto: '   ' }).success).toBe(false)
  })
})
```

- [ ] **Paso 2: correr y confirmar que falla**

Correr: `npx vitest run --project unit tests/unit/mensajes/validacion.test.ts`
Esperado: FALLA — los esquemas no existen.

- [ ] **Paso 3: implementar**

En `lib/validacion/mensajes.ts`, después de `esquemaBorrado` (reutiliza `texto` e `idMensaje`, ya
definidos arriba en el archivo):

```ts
export const esquemaModeracion = z.object({
  id: idMensaje,
  estado: z.enum(['aprobado', 'rechazado'], { error: 'Elegí aprobar o rechazar.' }),
  texto: texto.optional(),
  motivoRechazo: z.string().trim().max(500, 'El motivo puede tener hasta 500 caracteres.').optional(),
})

export const esquemaEdicionPropia = z.object({ id: idMensaje, texto })
```

- [ ] **Paso 4: correr y confirmar que pasa**

Correr: `npx vitest run --project unit tests/unit/mensajes/validacion.test.ts`
Esperado: PASA.

- [ ] **Paso 5: commit**

```bash
git add lib/validacion/mensajes.ts tests/unit/mensajes/validacion.test.ts
git commit -m "feat(mensajes): valida moderar y corregir un mensaje rechazado"
```

---

### Tarea 6: Server Actions y consulta de pendientes

**Archivos:**
- Modificar: `app/(app)/mensajes/acciones.ts`
- Modificar: `lib/mensajes/consultas.ts`

Sin prueba unitaria propia (compone RLS ya probada en la Tarea 1); se verifica con el e2e de la
Tarea 8.

- [ ] **Paso 1: `app/(app)/mensajes/acciones.ts`** — agregar, al final (imports nuevos:
  `esquemaEdicionPropia, esquemaModeracion` en el import ya existente de `@/lib/validacion/mensajes`):

```ts
/** Solo el Director. Aprobar/rechazar, y de paso corregir el texto si hace falta. */
export async function moderarMensaje(entrada: unknown): Promise<Resultado<null>> {
  const sesion = await perfilParaAccion('director')
  if (!sesion.ok) return sesion

  const datos = esquemaModeracion.safeParse(entrada)
  if (!datos.success) return fallo('Revisá los datos.', camposConError(datos.error))

  const cambios: { estado: 'aprobado' | 'rechazado'; texto?: string; motivo_rechazo: string | null } = {
    estado: datos.data.estado,
    motivo_rechazo: datos.data.estado === 'rechazado' ? (datos.data.motivoRechazo ?? null) : null,
  }
  if (datos.data.texto !== undefined) cambios.texto = datos.data.texto

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('mensajes').update(cambios).eq('id', datos.data.id).select('id')
  if (error) {
    console.error('moderarMensaje', error)
    return fallo('No se pudo actualizar el mensaje. Intentá de nuevo.')
  }
  if (data.length === 0) return fallo('El mensaje ya no existe.')

  revalidatePath('/mensajes')
  return exito(null)
}

/** El autor corrige su propio mensaje rechazado; RLS exige que siga en ese estado. */
export async function editarMensajePropio(_previo: Resultado<null> | null, formData: FormData): Promise<Resultado<null>> {
  const sesion = await perfilParaAccion()
  if (!sesion.ok) return sesion

  const entrada = esquemaEdicionPropia.safeParse({ id: formData.get('id'), texto: formData.get('texto') })
  if (!entrada.success) return fallo('Revisá el mensaje.', camposConError(entrada.error))

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('mensajes').update({ texto: entrada.data.texto }).eq('id', entrada.data.id).select('id')
  if (error) {
    console.error('editarMensajePropio', error)
    return fallo('No se pudo guardar. Intentá de nuevo.')
  }
  if (data.length === 0) return fallo('Ya no podés editar este mensaje.')

  revalidatePath('/mensajes')
  return exito(null)
}
```

- [ ] **Paso 2: `lib/mensajes/consultas.ts`** — agregar (import `type MensajeFila` de
  `@/lib/mensajes/feed`):

```ts
/** Cola de moderación del Director: los mensajes que esperan aprobación, más viejos primero. */
export async function listarMensajesPendientes(): Promise<MensajeFila[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('mensajes')
    .select('id, autor_id, padre_id, texto, creado_en, estado, motivo_rechazo')
    .eq('estado', 'pendiente')
    .order('creado_en')
  if (error) throw error
  return data
}
```

- [ ] **Paso 3: commit**

```bash
git add app/\(app\)/mensajes/acciones.ts lib/mensajes/consultas.ts
git commit -m "feat(mensajes): acciones de moderación y consulta de pendientes"
```

---

### Tarea 7: UI — insignia de estado, corregir y reenviar, cola de moderación

**Archivos:**
- Modificar: `app/(app)/mensajes/page.tsx`
- Crear: `app/(app)/mensajes/_componentes/cola-moderacion.tsx`
- Crear: `app/(app)/mensajes/_componentes/formulario-editar-propio.tsx`
- Modificar: `app/(app)/mensajes/_componentes/tarjeta-mensaje.tsx`

- [ ] **Paso 1: `formulario-editar-propio.tsx`**

```tsx
'use client'

import { useActionState, useState } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { fallo, type Resultado } from '@/lib/acciones/resultado'
import { editarMensajePropio } from '../acciones'

export function FormularioEditarPropio({ id, textoActual }: { id: string; textoActual: string }) {
  const aviso = useAviso()
  const [texto, setTexto] = useState(textoActual)
  const [estado, accion] = useActionState(
    async (_previo: Resultado<null> | null, formData: FormData): Promise<Resultado<null>> => {
      let resultado: Resultado<null>
      try {
        resultado = await editarMensajePropio(null, formData)
      } catch {
        resultado = fallo('No se pudo guardar. Revisá tu conexión e intentá de nuevo.')
      }
      if (resultado.ok) aviso('Corregido. Esperando aprobación de nuevo.')
      else aviso(resultado.error)
      return resultado
    },
    null,
  )

  return (
    <form action={accion} className="form-editar-propio">
      <input type="hidden" name="id" value={id} />
      <textarea name="texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={2000} required />
      {estado && !estado.ok && <div className="campo-error">{estado.error}</div>}
      <BotonEnvio className="btn small">Corregir y reenviar</BotonEnvio>
    </form>
  )
}
```

- [ ] **Paso 2: `tarjeta-mensaje.tsx`** — insignia de estado + edición

Agregar, importado de `@/lib/mensajes/feed`, el tipo `EstadoMensaje`, y un componente local:

```tsx
function InsigniaEstado({ estado, motivoRechazo }: { estado: EstadoMensaje; motivoRechazo: string | null }) {
  if (estado === 'aprobado') return null
  if (estado === 'pendiente') return <span className="badge pendiente">Esperando aprobación</span>
  return <span className="badge rechazado">Rechazado{motivoRechazo ? `: ${motivoRechazo}` : ''}</span>
}
```

En `TarjetaMensaje`, dentro de `.msg-body` (después de `.msg-meta`, antes de `.msg-text`):
`<InsigniaEstado estado={publicacion.estado} motivoRechazo={publicacion.motivoRechazo} />`, y después
de `.msg-text` (o donde corresponda visualmente), si `publicacion.estado === 'rechazado' &&
publicacion.autorId === usuario.id`:
`<FormularioEditarPropio id={publicacion.id} textoActual={publicacion.texto} />`.

Igual en `NodoRespuesta`, con `respuesta.estado`/`respuesta.motivoRechazo` y comparando
`respuesta` contra `usuario.id` (agregar `usuario: UsuarioFeed` a sus props si no lo tiene ya —
revisar la firma actual antes de tocarla).

- [ ] **Paso 3: `cola-moderacion.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { llamarAccion } from '@/lib/acciones/llamar'
import type { MensajeFila } from '@/lib/mensajes/feed'
import type { PerfilResumen } from '@/lib/perfiles/consultas'
import { moderarMensaje } from '../acciones'

function FilaPendiente({ mensaje, autor }: { mensaje: MensajeFila; autor: PerfilResumen | undefined }) {
  const aviso = useAviso()
  const [texto, setTexto] = useState(mensaje.texto)
  const [motivo, setMotivo] = useState('')
  const [pendiente, iniciar] = useTransition()

  function moderar(estado: 'aprobado' | 'rechazado') {
    iniciar(async () => {
      const resultado = await llamarAccion(() =>
        moderarMensaje({
          id: mensaje.id,
          estado,
          texto: texto !== mensaje.texto ? texto : undefined,
          motivoRechazo: motivo || undefined,
        }),
      )
      if (resultado.ok) aviso(estado === 'aprobado' ? 'Mensaje aprobado.' : 'Mensaje rechazado.')
      else aviso(resultado.error)
    })
  }

  return (
    <div className="card pendiente-item">
      <div className="msg-meta">
        {autor?.siglas ?? '…'} · {mensaje.padre_id ? 'Respuesta' : 'Publicación'}
      </div>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} />
      <div className="field">
        <label htmlFor={`motivo-${mensaje.id}`}>Motivo del rechazo (opcional)</label>
        <input id={`motivo-${mensaje.id}`} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      <div className="modal-foot">
        <button type="button" className="btn ghost small" onClick={() => moderar('rechazado')} disabled={pendiente}>
          Rechazar
        </button>
        <button type="button" className="btn small" onClick={() => moderar('aprobado')} disabled={pendiente}>
          Aprobar
        </button>
      </div>
    </div>
  )
}

export function ColaModeracion({ mensajes, perfiles }: { mensajes: MensajeFila[]; perfiles: PerfilResumen[] }) {
  const porId = Object.fromEntries(perfiles.map((p) => [p.id, p]))
  if (mensajes.length === 0) return <div className="empty-state">No hay mensajes pendientes de aprobación.</div>
  return (
    <div className="lista-pendientes">
      {mensajes.map((m) => (
        <FilaPendiente key={m.id} mensaje={m} autor={porId[m.autor_id]} />
      ))}
    </div>
  )
}
```

- [ ] **Paso 4: `page.tsx`** — tercera pestaña

Agregar `SeccionPendientes` (mismo patrón que `SeccionRegistro`, usando `listarMensajesPendientes` +
`listarPerfiles`), una tercera variable `verPendientes = esDirector && vista === 'pendientes'`, un
tercer `<Link href="/mensajes?vista=pendientes">Pendientes</Link>` en el `<nav>`, y el render final:
`verRegistro ? <SeccionRegistro /> : verPendientes ? <SeccionPendientes /> : <SeccionFeed perfil={perfil} />`.

- [ ] **Paso 5: verificación manual**

`npm run dev`: Residente publica, ve "Esperando aprobación" en su propia burbuja; Director entra a
"Pendientes", lo aprueba; el Residente lo ve aparecer normal (sin recargar, vía tiempo real).
Repetir rechazando con motivo y corrigiendo desde la burbuja del Residente.

- [ ] **Paso 6: commit**

```bash
git add app/\(app\)/mensajes/page.tsx app/\(app\)/mensajes/_componentes/cola-moderacion.tsx app/\(app\)/mensajes/_componentes/formulario-editar-propio.tsx app/\(app\)/mensajes/_componentes/tarjeta-mensaje.tsx
git commit -m "feat(mensajes): insignia de estado, corregir y reenviar, cola de moderación"
```

---

### Tarea 8: e2e

**Archivos:**
- Modificar: `tests/e2e/mensajes.spec.ts`

- [ ] **Paso 1: escribir el escenario completo**

```ts
test('un mensaje de Residente queda pendiente, el Director lo rechaza, el Residente lo corrige y reenvía, el Director lo aprueba', async ({ page, context }) => {
  const texto = textoUnico('Pendiente')
  await iniciarSesion(page, 'residente')
  await page.getByLabel('Escribí un mensaje').fill(texto)
  await page.getByRole('button', { name: 'Publicar' }).click()
  await expect(page.getByText(texto)).toBeVisible()
  await expect(page.locator('.msg', { hasText: texto }).getByText('Esperando aprobación')).toBeVisible()

  // Otro Residente, en otra sesión, no lo ve todavía.
  const paginaOtro = await context.newPage()
  await iniciarSesion(paginaOtro, 'residente2')
  await expect(paginaOtro.getByText(texto)).toHaveCount(0)

  // El Director lo rechaza con motivo.
  const paginaDirector = await context.newPage()
  await iniciarSesion(paginaDirector, 'director')
  await paginaDirector.goto('/mensajes?vista=pendientes')
  const filaPendiente = paginaDirector.locator('.pendiente-item', { hasText: texto })
  await filaPendiente.getByLabel('Motivo del rechazo (opcional)').fill('Corregí la fecha')
  await filaPendiente.getByRole('button', { name: 'Rechazar' }).click()
  await expect(filaPendiente).toHaveCount(0)

  // El Residente ve el rechazo y corrige.
  await expect(page.locator('.msg', { hasText: texto }).getByText('Rechazado: Corregí la fecha')).toBeVisible()
  const textoCorregido = `${texto} (corregido)`
  await page.locator('.msg', { hasText: texto }).getByRole('textbox').fill(textoCorregido)
  await page.locator('.msg', { hasText: texto }).getByRole('button', { name: 'Corregir y reenviar' }).click()
  await expect(page.getByText('Esperando aprobación')).toBeVisible()

  // El Director lo aprueba.
  await paginaDirector.goto('/mensajes?vista=pendientes')
  await paginaDirector.locator('.pendiente-item', { hasText: textoCorregido }).getByRole('button', { name: 'Aprobar' }).click()

  // Aparece para todos, en tiempo real, sin recargar.
  await expect(page.getByText(textoCorregido)).toBeVisible()
  await expect(page.locator('.msg', { hasText: textoCorregido }).getByText('Esperando aprobación')).toHaveCount(0)
  await expect(paginaOtro.getByText(textoCorregido)).toBeVisible({ timeout: 10_000 })

  await paginaOtro.close()
  await paginaDirector.close()
})
```

- [ ] **Paso 2: correr y confirmar que pasa**

Correr: `npx playwright test tests/e2e/mensajes.spec.ts -g "pendiente"`
Esperado: PASA.

- [ ] **Paso 3: commit**

```bash
git add tests/e2e/mensajes.spec.ts
git commit -m "test(mensajes): e2e de aprobación, rechazo y reenvío"
```

---

### Tarea 9: tipos de Supabase y apertura del PR

Mismo procedimiento que los planes hermanos:

```bash
git push -u origin HEAD
gh run download "$(gh run list --branch "$(git branch --show-current)" --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId')" -n database-types -D lib/supabase
git add lib/supabase/database.types.ts
git commit -m "chore(mensajes): regenera database.types.ts"
git push
```

Abrir el PR, confirmar CI en verde. **No fusionar sin que el usuario lo revise y mergee.**
