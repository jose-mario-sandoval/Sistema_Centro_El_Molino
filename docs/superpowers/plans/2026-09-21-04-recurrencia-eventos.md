# Recurrencia de eventos — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** el Director crea una serie de eventos (semanal en un día fijo, mensual en el mismo día
del mes, o mensual en el mismo día-de-semana del mes) con fecha de fin obligatoria. Cada ocurrencia es
una fila normal de `eventos`: editar o cancelar una fecha puntual ya funciona con el CRUD que existe
hoy, sin tocarlo. Cancelar la serie completa borra las ocurrencias futuras.

**Arquitectura:** tabla nueva `series_eventos` (solo el patrón + los datos que se copian a cada
ocurrencia) y columna `eventos.serie_id`. La generación de fechas es lógica pura en TypeScript
(`generarFechasSerie()`, muy testeable) — la base **no** hace el cálculo de calendario. Crear una
serie inserta la fila de `series_eventos` y todas las ocurrencias en una sola llamada RPC
(`crear_serie_eventos`, `security invoker`) para que sea atómico: si algo falla, no queda una serie a
medio crear.

**Stack:** Next.js (App Router), TypeScript, `@supabase/supabase-js`, zod 4, Vitest, Playwright,
Postgres 17.

**Referencias:** spec [`docs/superpowers/specs/2026-09-21-eventos-mensajes-comidas-design.md`](../specs/2026-09-21-eventos-mensajes-comidas-design.md)
§2 y §6 · plan hermano [`2026-09-21-01-categorias-evento-pedidos.md`](2026-09-21-01-categorias-evento-pedidos.md)
(**prerrequisito real**: este plan agrega `serie_id` sobre el esquema de `eventos` que deja ese plan —
`tipo`, `requiere_cocina`, `requiere_otro_texto` — implementar después de que esté aplicado) · modelo
de "crear sin editar, solo cancelar" ya usado en ausencias (`app/(app)/calendario/_componentes/panel-ausencias.tsx`).

**Antes de empezar:**
- El plan de categorías de evento ya está mergeado y aplicado.
- Pruebas de integración y e2e: banco de pruebas local o CI.

---

## Decisiones de esta pista

- **Solo 3 patrones** (spec, confirmado con el usuario): semanal en un día fijo, mensual mismo día del
  mes, mensual mismo día-de-semana del mes (ej. "el primer lunes"). Nada de "cada N semanas".
- **`fecha_fin` siempre obligatoria**, tope de 730 días desde `fecha_inicio` (chequeado en la base con
  un `CHECK`, no con un código de error propio — no hace falta `MOLxx` nuevo).
- **Mes sin ese día** (ej. 31 en febrero): esa ocurrencia se omite ese mes, no se corre al día
  siguiente. `generarFechasSerie()` lo resuelve solo (nunca genera un 31 de febrero).
- **La generación de fechas es TypeScript puro**, no SQL: mucho más fácil de testear
  exhaustivamente con Vitest que con PL/pgSQL, y sigue el patrón del repo ("lógica pura en `lib/`, sin
  `server-only`"). La base solo recibe el arreglo de fechas ya calculado.
- **Atomicidad vía una sola función RPC** (`crear_serie_eventos`, sin `security definer`: corre como
  el Director que llama, así RLS de `series_eventos` y `eventos` se aplica normal en cada fila que
  inserta). Sin esto, crear la serie serían dos llamadas de red separadas (insertar la serie, después
  insertar N eventos) y una falla a mitad de camino dejaría una serie fantasma.
- **Ocurrencia puntual = fila de `eventos` como cualquier otra.** Editar o cancelar una fecha de la
  serie usa el `UPDATE`/`DELETE` que ya existe (Tarea del plan de calendario original) — no se
  necesita tabla de excepciones ni Server Action nueva para eso.
- **Cancelar la serie completa = `DELETE` por `serie_id` y `fecha >= hoy`.** Las ocurrencias pasadas
  quedan intactas. `series_eventos` no se borra ni se edita nunca (igual que ausencias: "para cambiar
  se quita y se vuelve a marcar" — acá, para cambiar el patrón se cancela hacia adelante y se crea una
  serie nueva).
- **El formulario de alta gana un interruptor "Se repite"**: si no se marca, la experiencia de crear
  un evento suelto no cambia en nada.

---

## Mapa de archivos

```
supabase/migrations/20260921210000_series_eventos.sql   nuevo — tabla, RLS, función crear_serie_eventos
lib/calendario/recurrencia.ts                             nuevo — generarFechasSerie(), diasEntre()
lib/calendario/tipos.ts                                   Evento gana serie_id
lib/calendario/consultas.ts                                el select de Director/Residente incluye serie_id
lib/validacion/calendario.ts                               esquemaSerieEventos, esquemaEliminarSerie
app/(app)/calendario/acciones.ts                            crearSerieEventos, eliminarSerieDesdeHoy
app/(app)/calendario/_componentes/campos-recurrencia.tsx    nuevo — patrón + fecha de fin
app/(app)/calendario/_componentes/formulario-evento.tsx     interruptor "Se repite" en el alta
app/(app)/calendario/_componentes/modal-dia.tsx              botón "Cancelar toda la serie" si evento.serie_id
tests/unit/calendario/recurrencia.test.ts                   nuevo — generarFechasSerie() exhaustivo
tests/unit/calendario/validacion.test.ts                    esquemaSerieEventos
tests/integration/calendario.test.ts                        RLS de series_eventos, atomicidad, cancelar hacia adelante
tests/e2e/calendario.spec.ts                                 crear una serie semanal; cancelar una ocurrencia puntual; cancelar la serie
```

---

## Tareas

### Tarea 1: `generarFechasSerie()` — lógica pura, sin base de datos

**Archivos:**
- Crear: `lib/calendario/recurrencia.ts`
- Test: `tests/unit/calendario/recurrencia.test.ts`

- [ ] **Paso 1: escribir las pruebas que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { diasEntre, generarFechasSerie } from '@/lib/calendario/recurrencia'

describe('generarFechasSerie: semanal', () => {
  it('genera cada semana en el día pedido, desde el primer día que coincide', () => {
    // 2026-10-07 es miércoles; el primer sábado desde ahí es 2026-10-10.
    const fechas = generarFechasSerie({ patron: 'semanal', diaSemana: 6 }, '2026-10-07', '2026-10-31')
    expect(fechas).toEqual(['2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31'])
  })

  it('si fechaInicio ya es el día pedido, lo incluye', () => {
    const fechas = generarFechasSerie({ patron: 'semanal', diaSemana: 3 }, '2026-10-07', '2026-10-07')
    expect(fechas).toEqual(['2026-10-07'])
  })

  it('sin ninguna coincidencia en el rango, lista vacía', () => {
    const fechas = generarFechasSerie({ patron: 'semanal', diaSemana: 6 }, '2026-10-07', '2026-10-08')
    expect(fechas).toEqual([])
  })
})

describe('generarFechasSerie: mensual_dia_fijo', () => {
  it('el mismo día de cada mes', () => {
    const fechas = generarFechasSerie({ patron: 'mensual_dia_fijo', diaMes: 15 }, '2026-10-01', '2027-01-31')
    expect(fechas).toEqual(['2026-10-15', '2026-11-15', '2026-12-15', '2027-01-15'])
  })

  it('el 31 se omite en los meses que no llegan a 31 (no se corre de día)', () => {
    const fechas = generarFechasSerie({ patron: 'mensual_dia_fijo', diaMes: 31 }, '2026-10-01', '2027-01-31')
    expect(fechas).toEqual(['2026-10-31', '2026-12-31', '2027-01-31']) // noviembre tiene 30, se omite
  })

  it('el 29 de febrero solo aparece en año bisiesto', () => {
    const fechas = generarFechasSerie({ patron: 'mensual_dia_fijo', diaMes: 29 }, '2027-01-01', '2028-03-31')
    expect(fechas).toContain('2028-02-29') // 2028 es bisiesto
    expect(fechas).not.toContain('2027-02-29')
  })

  it('respeta fechaInicio y fechaFin dentro del primer y último mes', () => {
    const fechas = generarFechasSerie({ patron: 'mensual_dia_fijo', diaMes: 5 }, '2026-10-10', '2026-12-03')
    expect(fechas).toEqual(['2026-11-05']) // el 5/10 ya pasó, el 5/12 es después del fin
  })
})

describe('generarFechasSerie: mensual_dia_semana', () => {
  it('el primer lunes de cada mes', () => {
    const fechas = generarFechasSerie({ patron: 'mensual_dia_semana', diaSemana: 1, ordinalSemana: 1 }, '2026-10-01', '2027-01-31')
    expect(fechas).toEqual(['2026-10-05', '2026-11-02', '2026-12-07', '2027-01-04'])
  })

  it('el último viernes de cada mes', () => {
    const fechas = generarFechasSerie({ patron: 'mensual_dia_semana', diaSemana: 5, ordinalSemana: -1 }, '2026-10-01', '2026-12-31')
    expect(fechas).toEqual(['2026-10-30', '2026-11-27', '2026-12-25'])
  })

  it('un ordinal que no existe ese mes (ej. quinto martes) se omite', () => {
    // Octubre 2026 no tiene un quinto miércoles (miércoles: 7, 14, 21, 28 → solo 4).
    const fechas = generarFechasSerie({ patron: 'mensual_dia_semana', diaSemana: 3, ordinalSemana: 4 }, '2026-10-01', '2026-10-31')
    expect(fechas).toEqual(['2026-10-28'])
  })
})

describe('diasEntre', () => {
  it('cuenta los días entre dos fechas, incluidos ambos extremos menos uno', () => {
    expect(diasEntre('2026-10-01', '2026-10-01')).toBe(0)
    expect(diasEntre('2026-10-01', '2026-10-08')).toBe(7)
  })
})
```

- [ ] **Paso 2: correr y confirmar que falla**

Correr: `npx vitest run --project unit tests/unit/calendario/recurrencia.test.ts`
Esperado: FALLA — el módulo no existe.

- [ ] **Paso 3: implementar**

```ts
import { diaSemana, type FechaISO } from '@/lib/fechas'

export type ParametrosSerie =
  | { patron: 'semanal'; diaSemana: number }
  | { patron: 'mensual_dia_fijo'; diaMes: number }
  | { patron: 'mensual_dia_semana'; diaSemana: number; ordinalSemana: 1 | 2 | 3 | 4 | -1 }

function aNumeros(fecha: FechaISO): [number, number, number] {
  const [a, m, d] = fecha.split('-').map(Number)
  return [a, m, d]
}

function fechaDesdeUTC(anio: number, mes: number, dia: number): FechaISO {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(fecha.getUTCDate()).padStart(2, '0')}`
}

function diasEnElMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

function sumarDiasUTC(fecha: FechaISO, dias: number): FechaISO {
  const [a, m, d] = aNumeros(fecha)
  return fechaDesdeUTC(a, m, d + dias)
}

/** Cantidad de días entre dos FechaISO (>= 0 si hasta >= desde). */
export function diasEntre(desde: FechaISO, hasta: FechaISO): number {
  const [a1, m1, d1] = aNumeros(desde)
  const [a2, m2, d2] = aNumeros(hasta)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000)
}

function semanal(dia: number, fechaInicio: FechaISO, fechaFin: FechaISO): FechaISO[] {
  const fechas: FechaISO[] = []
  let actual = fechaInicio
  while (actual <= fechaFin && diaSemana(actual) !== dia) actual = sumarDiasUTC(actual, 1)
  while (actual <= fechaFin) {
    fechas.push(actual)
    actual = sumarDiasUTC(actual, 7)
  }
  return fechas
}

function paraCadaMes(fechaInicio: FechaISO, fechaFin: FechaISO, calcular: (anio: number, mes: number) => FechaISO | null): FechaISO[] {
  const [anioInicio, mesInicio] = aNumeros(fechaInicio)
  const [anioFin, mesFin] = aNumeros(fechaFin)
  const fechas: FechaISO[] = []
  let anio = anioInicio
  let mes = mesInicio
  while (anio < anioFin || (anio === anioFin && mes <= mesFin)) {
    const fecha = calcular(anio, mes)
    if (fecha && fecha >= fechaInicio && fecha <= fechaFin) fechas.push(fecha)
    mes += 1
    if (mes > 12) {
      mes = 1
      anio += 1
    }
  }
  return fechas
}

function mensualDiaFijo(diaMes: number, fechaInicio: FechaISO, fechaFin: FechaISO): FechaISO[] {
  return paraCadaMes(fechaInicio, fechaFin, (anio, mes) => (diaMes <= diasEnElMes(anio, mes) ? fechaDesdeUTC(anio, mes, diaMes) : null))
}

function enesimoDiaSemanaDelMes(anio: number, mes: number, dia: number, n: number): FechaISO | null {
  let d = 1
  while (diaSemana(fechaDesdeUTC(anio, mes, d)) !== dia) d += 1
  d += (n - 1) * 7
  return d <= diasEnElMes(anio, mes) ? fechaDesdeUTC(anio, mes, d) : null
}

function ultimoDiaSemanaDelMes(anio: number, mes: number, dia: number): FechaISO {
  let d = diasEnElMes(anio, mes)
  while (diaSemana(fechaDesdeUTC(anio, mes, d)) !== dia) d -= 1
  return fechaDesdeUTC(anio, mes, d)
}

function mensualDiaSemana(dia: number, ordinal: 1 | 2 | 3 | 4 | -1, fechaInicio: FechaISO, fechaFin: FechaISO): FechaISO[] {
  return paraCadaMes(fechaInicio, fechaFin, (anio, mes) =>
    ordinal === -1 ? ultimoDiaSemanaDelMes(anio, mes, dia) : enesimoDiaSemanaDelMes(anio, mes, dia, ordinal),
  )
}

/** Genera las fechas de una serie entre fechaInicio y fechaFin (ambas incluidas), según el patrón. */
export function generarFechasSerie(parametros: ParametrosSerie, fechaInicio: FechaISO, fechaFin: FechaISO): FechaISO[] {
  if (parametros.patron === 'semanal') return semanal(parametros.diaSemana, fechaInicio, fechaFin)
  if (parametros.patron === 'mensual_dia_fijo') return mensualDiaFijo(parametros.diaMes, fechaInicio, fechaFin)
  return mensualDiaSemana(parametros.diaSemana, parametros.ordinalSemana, fechaInicio, fechaFin)
}
```

- [ ] **Paso 4: correr y confirmar que pasa**

Correr: `npx vitest run --project unit tests/unit/calendario/recurrencia.test.ts`
Esperado: PASA.

- [ ] **Paso 5: commit**

```bash
git add lib/calendario/recurrencia.ts tests/unit/calendario/recurrencia.test.ts
git commit -m "feat(calendario): generarFechasSerie(), cálculo puro de recurrencia"
```

---

### Tarea 2: migración — `series_eventos`, `eventos.serie_id`, `crear_serie_eventos`

**Archivos:**
- Crear: `supabase/migrations/20260921210000_series_eventos.sql`
- Test: `tests/integration/calendario.test.ts`

- [ ] **Paso 1: escribir la migración**

```sql
-- =========================================================
-- Recurrencia de eventos. Cada ocurrencia es una fila normal de `eventos`
-- (con `serie_id`): editar o cancelar una fecha puntual usa el UPDATE/DELETE
-- que ya existe, sin tocarlo. `series_eventos` solo guarda el patrón para
-- poder generar las filas al crear la serie; no se edita ni se borra nunca
-- (para cambiar el patrón: cancelar hacia adelante y crear una serie nueva).
-- =========================================================

create type public.patron_recurrencia as enum ('semanal', 'mensual_dia_fijo', 'mensual_dia_semana');

create table public.series_eventos (
  id uuid primary key default gen_random_uuid(),
  patron public.patron_recurrencia not null,
  dia_semana smallint check (dia_semana between 1 and 7),
  ordinal_semana smallint check (ordinal_semana in (1, 2, 3, 4, -1)),
  dia_mes smallint check (dia_mes between 1 and 31),
  fecha_inicio date not null,
  fecha_fin date not null,
  hora time,
  titulo text not null check (titulo = btrim(titulo) and length(titulo) between 1 and 120),
  tipo public.tipo_evento not null default 'otro',
  requiere_cocina public.requerimiento_cocina[] not null default '{}',
  requiere_otro_texto text,
  creado_por uuid not null references public.perfiles (id) on delete cascade,
  creado_en timestamptz not null default now(),
  constraint series_eventos_rango_valido check (fecha_fin >= fecha_inicio and (fecha_fin - fecha_inicio) <= 730),
  constraint series_eventos_campos_de_patron check (
    (patron = 'semanal' and dia_semana is not null and ordinal_semana is null and dia_mes is null)
    or (patron = 'mensual_dia_fijo' and dia_mes is not null and dia_semana is null and ordinal_semana is null)
    or (patron = 'mensual_dia_semana' and dia_semana is not null and ordinal_semana is not null and dia_mes is null)
  ),
  constraint series_eventos_requiere_cocina_valido check (public.requiere_cocina_valido(requiere_cocina)),
  constraint series_eventos_requiere_otro_texto_valido check (
    requiere_otro_texto is null or (requiere_otro_texto = btrim(requiere_otro_texto) and length(requiere_otro_texto) between 1 and 200)
  )
);

comment on table public.series_eventos is
  'Solo el patrón de una serie ya creada (para mostrar "parte de una serie" y poder cancelarla hacia adelante). Sin UPDATE ni DELETE: para cambiar el patrón se cancela y se crea una serie nueva.';

alter table public.series_eventos enable row level security;
revoke all on table public.series_eventos from anon;
grant select, insert on table public.series_eventos to authenticated;
grant select, insert, update, delete on table public.series_eventos to service_role;

create policy "series_eventos: el Director lee"
  on public.series_eventos for select
  to authenticated
  using ((select public.mi_rol()) = 'director');

create policy "series_eventos: el Director crea"
  on public.series_eventos for insert
  to authenticated
  with check ((select public.mi_rol()) = 'director' and creado_por = (select auth.uid()));

-- ---------- Cada ocurrencia es una fila de eventos ----------
alter table public.eventos add column serie_id uuid references public.series_eventos (id);
create index eventos_serie_idx on public.eventos (serie_id) where serie_id is not null;
comment on column public.eventos.serie_id is
  'De qué serie es esta ocurrencia, si es que viene de una. Editar/borrar esta fila no toca las demás.';

-- ---------- Crear la serie completa: atómico (la serie + todas sus filas, o ninguna) ----------
-- Sin security definer: corre como quien llama, así RLS de series_eventos y eventos se aplica normal
-- (Director, creado_por = auth.uid()) en cada INSERT que hace, fila por fila.
create function public.crear_serie_eventos(
  p_patron public.patron_recurrencia,
  p_dia_semana smallint,
  p_ordinal_semana smallint,
  p_dia_mes smallint,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_hora time,
  p_titulo text,
  p_tipo public.tipo_evento,
  p_requiere_cocina public.requerimiento_cocina[],
  p_requiere_otro_texto text,
  p_fechas date[]
)
returns uuid
language plpgsql
as $$
declare
  v_serie_id uuid;
begin
  if coalesce(array_length(p_fechas, 1), 0) = 0 then
    raise exception 'Ese patrón no genera ninguna fecha en el rango elegido.';
  end if;
  if exists (select 1 from unnest(p_fechas) as f where f < p_fecha_inicio or f > p_fecha_fin) then
    raise exception 'Alguna fecha generada cae fuera del rango de la serie.';
  end if;

  insert into public.series_eventos (
    patron, dia_semana, ordinal_semana, dia_mes, fecha_inicio, fecha_fin, hora, titulo, tipo,
    requiere_cocina, requiere_otro_texto, creado_por
  ) values (
    p_patron, p_dia_semana, p_ordinal_semana, p_dia_mes, p_fecha_inicio, p_fecha_fin, p_hora, p_titulo, p_tipo,
    p_requiere_cocina, p_requiere_otro_texto, auth.uid()
  )
  returning id into v_serie_id;

  insert into public.eventos (titulo, fecha, hora, tipo, requiere_cocina, requiere_otro_texto, serie_id, creado_por)
  select p_titulo, fecha, p_hora, p_tipo, p_requiere_cocina, p_requiere_otro_texto, v_serie_id, auth.uid()
  from unnest(p_fechas) as fecha;

  return v_serie_id;
end;
$$;

grant execute on function public.crear_serie_eventos(
  public.patron_recurrencia, smallint, smallint, smallint, date, date, time, text, public.tipo_evento,
  public.requerimiento_cocina[], text, date[]
) to authenticated;
```

- [ ] **Paso 2: escribir las pruebas de integración**

Agregar a `tests/integration/calendario.test.ts` (usa `admin`, `ids`, `clienteComo`, `SIN_PERMISO`,
`FECHA` ya definidos en el archivo):

```ts
describe('series_eventos y crear_serie_eventos', () => {
  async function crearSerie(director: Awaited<ReturnType<typeof clienteComo>>, fechas: string[], vararg?: Partial<{
    fecha_inicio: string
    fecha_fin: string
  }>) {
    return director.rpc('crear_serie_eventos', {
      p_patron: 'semanal',
      p_dia_semana: 6,
      p_ordinal_semana: null,
      p_dia_mes: null,
      p_fecha_inicio: vararg?.fecha_inicio ?? fechas[0],
      p_fecha_fin: vararg?.fecha_fin ?? fechas[fechas.length - 1],
      p_hora: '19:00',
      p_titulo: 'San Rafael',
      p_tipo: 'san_rafael',
      p_requiere_cocina: ['comida'],
      p_requiere_otro_texto: null,
      p_fechas: fechas,
    })
  }

  it('el Director crea una serie: se insertan la serie y todas las ocurrencias', async () => {
    const director = await clienteComo('director')
    const { data: serieId, error } = await crearSerie(director, ['2026-10-10', '2026-10-17', '2026-10-24'])
    expect(error).toBeNull()

    const { data: serie } = await admin.from('series_eventos').select('patron, fecha_inicio, fecha_fin').eq('id', serieId!).single()
    expect(serie).toEqual({ patron: 'semanal', fecha_inicio: '2026-10-10', fecha_fin: '2026-10-24' })

    const { data: ocurrencias } = await admin.from('eventos').select('fecha, titulo, serie_id').eq('serie_id', serieId!).order('fecha')
    expect(ocurrencias).toEqual([
      { fecha: '2026-10-10', titulo: 'San Rafael', serie_id: serieId },
      { fecha: '2026-10-17', titulo: 'San Rafael', serie_id: serieId },
      { fecha: '2026-10-24', titulo: 'San Rafael', serie_id: serieId },
    ])
  })

  it.each(SIN_PERMISO)('%s no puede crear una serie', async (clave) => {
    const cliente = await clienteComo(clave)
    const { error } = await crearSerie(cliente, ['2026-10-10'])
    expect(error).not.toBeNull()
  })

  it('rechaza un rango de más de 730 días', async () => {
    const director = await clienteComo('director')
    const { error } = await crearSerie(director, ['2026-10-10'], { fecha_inicio: '2026-10-10', fecha_fin: '2028-10-11' })
    expect(error?.code).toBe('23514')
  })

  it('rechaza una fecha generada fuera del rango de la serie (defensa además del cálculo en TS)', async () => {
    const director = await clienteComo('director')
    const { error } = await crearSerie(director, ['2026-11-01'], { fecha_inicio: '2026-10-10', fecha_fin: '2026-10-24' })
    expect(error).not.toBeNull()
    const { data } = await admin.from('series_eventos').select('id').eq('fecha_inicio', '2026-10-10').eq('fecha_fin', '2026-10-24')
    expect(data).toEqual([]) // no quedó una serie a medias: el INSERT de eventos falló y todo se deshizo.
  })

  it('cancelar la serie desde hoy borra solo las ocurrencias futuras', async () => {
    const director = await clienteComo('director')
    const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const { data: serieId } = await crearSerie(director, [ayer, '2026-12-05', '2026-12-12'], { fecha_inicio: ayer, fecha_fin: '2026-12-12' })
    // "hoy" en la prueba: se borra todo lo que sea >= hoy real, así que uso una fecha bien futura como "hoy" simulado
    // vía el propio filtro que usará la Server Action (gte fecha, hoy). Acá se prueba el mecanismo de RLS/DELETE en sí:
    await director.from('eventos').delete().eq('serie_id', serieId!).gte('fecha', '2026-12-01')
    const { data: quedan } = await admin.from('eventos').select('fecha').eq('serie_id', serieId!).order('fecha')
    expect(quedan).toEqual([{ fecha: ayer }])
  })
})
```

- [ ] **Paso 3: correr, confirmar que falla, aplicar la migración, confirmar que pasa**

Correr: `npx vitest run --project integracion tests/integration/calendario.test.ts -t "series_eventos"`
Esperado: FALLA (tabla/función no existen) → aplicar migración → PASA.

- [ ] **Paso 4: commit**

```bash
git add supabase/migrations/20260921210000_series_eventos.sql tests/integration/calendario.test.ts
git commit -m "feat(calendario): series_eventos y crear_serie_eventos (esquema)"
```

---

### Tarea 3: validación zod — `esquemaSerieEventos`

**Archivos:**
- Modificar: `lib/validacion/calendario.ts`
- Test: `tests/unit/calendario/validacion.test.ts`

- [ ] **Paso 1: escribir las pruebas que fallan**

```ts
import { esquemaSerieEventos /* + lo que ya importaba */ } from '@/lib/validacion/calendario'

describe('esquemaSerieEventos', () => {
  const SEMANAL = { titulo: 'San Rafael', hora: '19:00', tipo: 'san_rafael', requiere_cocina: ['comida'], requiere_otro_texto: '',
    patron: 'semanal', dia_semana: '6', fecha_inicio: '2026-10-10', fecha_fin: '2026-12-26' }

  it('acepta una serie semanal válida', () => {
    expect(camposInvalidos(esquemaSerieEventos, SEMANAL)).toEqual([])
  })

  it('convierte dia_semana a número', () => {
    expect(esquemaSerieEventos.parse(SEMANAL).dia_semana).toBe(6)
  })

  it('rechaza fecha_fin antes de fecha_inicio', () => {
    expect(camposInvalidos(esquemaSerieEventos, { ...SEMANAL, fecha_inicio: '2026-12-26', fecha_fin: '2026-10-10' })).toEqual(['fecha_fin'])
  })

  it('rechaza más de 730 días de rango', () => {
    expect(camposInvalidos(esquemaSerieEventos, { ...SEMANAL, fecha_inicio: '2026-01-01', fecha_fin: '2028-06-01' })).toEqual(['fecha_fin'])
  })

  it('semanal exige dia_semana', () => {
    const { dia_semana: _omitido, ...sinDia } = SEMANAL
    void _omitido
    expect(camposInvalidos(esquemaSerieEventos, sinDia)).toEqual(['dia_semana'])
  })

  it('mensual_dia_fijo exige dia_mes, no dia_semana', () => {
    const { dia_semana: _omitido, ...base } = SEMANAL
    void _omitido
    expect(camposInvalidos(esquemaSerieEventos, { ...base, patron: 'mensual_dia_fijo', dia_mes: '15' })).toEqual([])
    expect(camposInvalidos(esquemaSerieEventos, { ...base, patron: 'mensual_dia_fijo' })).toEqual(['dia_mes'])
  })

  it('mensual_dia_semana exige dia_semana y ordinal_semana', () => {
    expect(camposInvalidos(esquemaSerieEventos, { ...SEMANAL, patron: 'mensual_dia_semana', ordinal_semana: '1' })).toEqual([])
    expect(camposInvalidos(esquemaSerieEventos, { ...SEMANAL, patron: 'mensual_dia_semana' })).toEqual(['ordinal_semana'])
  })

  it.each(['0', '5', '13'])('rechaza un ordinal_semana inválido (%s)', (ordinal_semana) => {
    expect(camposInvalidos(esquemaSerieEventos, { ...SEMANAL, patron: 'mensual_dia_semana', ordinal_semana })).toEqual(['ordinal_semana'])
  })
})
```

- [ ] **Paso 2: correr y confirmar que falla**

Correr: `npx vitest run --project unit tests/unit/calendario/validacion.test.ts`
Esperado: FALLA — `esquemaSerieEventos` no existe.

- [ ] **Paso 3: implementar**

En `lib/validacion/calendario.ts` (agregar `import { diasEntre } from '@/lib/calendario/recurrencia'`):

```ts
export const esquemaSerieEventos = z
  .object({
    titulo: z.string(MENSAJE_TITULO).trim().min(1, MENSAJE_TITULO).max(120, 'El título puede tener hasta 120 caracteres.'),
    hora: z.string('Hora inválida.').trim()
      .refine((hora) => hora === '' || PATRON_HORA.test(hora), 'Usá el formato HH:MM.')
      .transform((hora) => (hora === '' ? null : hora)),
    tipo: z.enum(TIPOS_EVENTO, { error: 'Elegí el tipo de evento.' }),
    requiere_cocina: z.array(z.enum(REQUERIMIENTOS_COCINA, { error: 'Pedido a la cocina inválido.' })).refine(requerimientosValidos, {
      message: '"Utensilios y materiales" no se combina con merienda ni comida.',
    }),
    requiere_otro_texto: z.string().trim().max(200, 'El pedido puede tener hasta 200 caracteres.').transform((v) => (v === '' ? null : v)),
    patron: z.enum(['semanal', 'mensual_dia_fijo', 'mensual_dia_semana'], { error: 'Elegí cómo se repite.' }),
    dia_semana: z.coerce.number('Elegí el día de la semana.').int().min(1).max(7).optional(),
    ordinal_semana: z.coerce.number('Elegí cuál.').int().refine((n) => [1, 2, 3, 4, -1].includes(n), 'Elegí una opción válida.').optional(),
    dia_mes: z.coerce.number('Elegí el día del mes.').int().min(1).max(31).optional(),
    fecha_inicio: z.iso.date('Fecha inválida.').refine((f) => f >= FECHA_MINIMA && f <= FECHA_MAXIMA, 'Fecha fuera de rango.'),
    fecha_fin: z.iso.date('Fecha inválida.').refine((f) => f >= FECHA_MINIMA && f <= FECHA_MAXIMA, 'Fecha fuera de rango.'),
  })
  .superRefine((datos, ctx) => {
    if (datos.fecha_fin < datos.fecha_inicio) {
      ctx.addIssue({ code: 'custom', path: ['fecha_fin'], message: 'La fecha de fin no puede ser anterior al inicio.' })
    } else if (diasEntre(datos.fecha_inicio, datos.fecha_fin) > 730) {
      ctx.addIssue({ code: 'custom', path: ['fecha_fin'], message: 'La serie no puede durar más de 730 días.' })
    }
    if (datos.patron === 'semanal' && datos.dia_semana === undefined) {
      ctx.addIssue({ code: 'custom', path: ['dia_semana'], message: 'Elegí el día de la semana.' })
    }
    if (datos.patron === 'mensual_dia_fijo' && datos.dia_mes === undefined) {
      ctx.addIssue({ code: 'custom', path: ['dia_mes'], message: 'Elegí el día del mes.' })
    }
    if (datos.patron === 'mensual_dia_semana') {
      if (datos.dia_semana === undefined) ctx.addIssue({ code: 'custom', path: ['dia_semana'], message: 'Elegí el día de la semana.' })
      if (datos.ordinal_semana === undefined) ctx.addIssue({ code: 'custom', path: ['ordinal_semana'], message: 'Elegí cuál (primero, segundo… o último).' })
    }
  })

export const esquemaEliminarSerie = z.object({ serie_id: z.uuid('Serie inválida.') })
```

- [ ] **Paso 4: correr y confirmar que pasa**

Correr: `npx vitest run --project unit tests/unit/calendario/validacion.test.ts`
Esperado: PASA.

- [ ] **Paso 5: commit**

```bash
git add lib/validacion/calendario.ts tests/unit/calendario/validacion.test.ts
git commit -m "feat(calendario): valida la creación de series recurrentes"
```

---

### Tarea 4: Server Actions — crear y cancelar la serie

**Archivos:**
- Modificar: `app/(app)/calendario/acciones.ts`
- Modificar: `lib/calendario/tipos.ts` (`Evento` gana `serie_id`)
- Modificar: `lib/calendario/consultas.ts` (el `select` de Director/Residente incluye `serie_id`)

Sin prueba unitaria propia (compone piezas ya probadas en las Tareas 1-3); se verifica con los e2e de
la Tarea 6.

- [ ] **Paso 1: `lib/calendario/tipos.ts`** — agregar `serie_id: string | null` a `Evento`, y
  `serie_id: null` fijo en `eventoParaAdministracion()` (Administración no necesita saber si un evento
  es parte de una serie, y el tipo lo exige igual que ya hace con `tipo: null`).

- [ ] **Paso 2: `lib/calendario/consultas.ts`** — agregar `serie_id` al `.select(...)` de
  Director/Residente (línea con `'id, titulo, fecha, hora, tipo, requiere_cocina, requiere_otro_texto'`
  → agregar `, serie_id`).

- [ ] **Paso 3: `app/(app)/calendario/acciones.ts`** — agregar las dos acciones (imports nuevos:
  `esquemaSerieEventos, esquemaEliminarSerie` de `@/lib/validacion/calendario`; `generarFechasSerie,
  type ParametrosSerie` de `@/lib/calendario/recurrencia`; `fechaISOEn` de `@/lib/fechas`):

```ts
export async function crearSerieEventos(
  _previo: Resultado<{ id: string; cantidad: number }> | null,
  formData: FormData,
): Promise<Resultado<{ id: string; cantidad: number }>> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso

  const entrada = esquemaSerieEventos.safeParse({
    titulo: formData.get('titulo'),
    hora: formData.get('hora') ?? '',
    tipo: formData.get('tipo'),
    requiere_cocina: formData.getAll('requiere_cocina'),
    requiere_otro_texto: formData.get('requiere_otro_texto') ?? '',
    patron: formData.get('patron'),
    dia_semana: formData.get('dia_semana') || undefined,
    ordinal_semana: formData.get('ordinal_semana') || undefined,
    dia_mes: formData.get('dia_mes') || undefined,
    fecha_inicio: formData.get('fecha_inicio'),
    fecha_fin: formData.get('fecha_fin'),
  })
  if (!entrada.success) return fallo('Revisá los datos de la serie.', camposConError(entrada.error))

  const datos = entrada.data
  const parametros: ParametrosSerie =
    datos.patron === 'semanal'
      ? { patron: 'semanal', diaSemana: datos.dia_semana! }
      : datos.patron === 'mensual_dia_fijo'
        ? { patron: 'mensual_dia_fijo', diaMes: datos.dia_mes! }
        : { patron: 'mensual_dia_semana', diaSemana: datos.dia_semana!, ordinalSemana: datos.ordinal_semana as 1 | 2 | 3 | 4 | -1 }
  const fechas = generarFechasSerie(parametros, datos.fecha_inicio, datos.fecha_fin)
  if (fechas.length === 0) {
    return fallo('Ese patrón no genera ninguna fecha en el rango elegido.', { fecha_fin: 'Ajustá el rango o el patrón.' })
  }

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('crear_serie_eventos', {
    p_patron: datos.patron,
    p_dia_semana: datos.dia_semana ?? null,
    p_ordinal_semana: datos.ordinal_semana ?? null,
    p_dia_mes: datos.dia_mes ?? null,
    p_fecha_inicio: datos.fecha_inicio,
    p_fecha_fin: datos.fecha_fin,
    p_hora: datos.hora,
    p_titulo: datos.titulo,
    p_tipo: datos.tipo,
    p_requiere_cocina: datos.requiere_cocina,
    p_requiere_otro_texto: datos.requiere_otro_texto,
    p_fechas: fechas,
  })
  if (error) return fallo('No se pudo crear la serie. Intentá de nuevo.')

  revalidatePath('/calendario')
  return exito({ id: data, cantidad: fechas.length })
}

export async function eliminarSerieDesdeHoy(entrada: unknown): Promise<Resultado<{ cantidad: number }>> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso

  const datos = esquemaEliminarSerie.safeParse(entrada)
  if (!datos.success) return fallo('Serie inválida.')

  const hoy = fechaISOEn(new Date())
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('eventos').delete().eq('serie_id', datos.data.serie_id).gte('fecha', hoy).select('id')
  if (error) return fallo('No se pudo cancelar la serie. Intentá de nuevo.')

  revalidatePath('/calendario')
  return exito({ cantidad: data.length })
}
```

- [ ] **Paso 4: commit**

```bash
git add lib/calendario/tipos.ts lib/calendario/consultas.ts app/\(app\)/calendario/acciones.ts
git commit -m "feat(calendario): acciones para crear una serie y cancelarla desde hoy"
```

---

### Tarea 5: UI — interruptor "Se repite" y "Cancelar toda la serie"

**Archivos:**
- Crear: `app/(app)/calendario/_componentes/campos-recurrencia.tsx`
- Modificar: `app/(app)/calendario/_componentes/formulario-evento.tsx`
- Modificar: `app/(app)/calendario/_componentes/modal-dia.tsx`

- [ ] **Paso 1: `campos-recurrencia.tsx`** — patrón + campos condicionales + fecha de fin:

```tsx
'use client'

import { useId } from 'react'
import type { FechaISO } from '@/lib/fechas'

const ETIQUETA_DIA_SEMANA = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const ETIQUETA_ORDINAL: Record<string, string> = { '1': 'Primer', '2': 'Segundo', '3': 'Tercer', '4': 'Cuarto', '-1': 'Último' }

export type Patron = 'semanal' | 'mensual_dia_fijo' | 'mensual_dia_semana'

function ErrorCampo({ mensaje }: { mensaje?: string }) {
  return mensaje ? <div className="campo-error">{mensaje}</div> : null
}

export function CamposRecurrencia({
  patron,
  alCambiarPatron,
  diaSemana,
  alCambiarDiaSemana,
  ordinalSemana,
  alCambiarOrdinalSemana,
  diaMes,
  alCambiarDiaMes,
  fechaFin,
  alCambiarFechaFin,
  errores,
}: {
  patron: Patron
  alCambiarPatron: (p: Patron) => void
  diaSemana: string
  alCambiarDiaSemana: (v: string) => void
  ordinalSemana: string
  alCambiarOrdinalSemana: (v: string) => void
  diaMes: string
  alCambiarDiaMes: (v: string) => void
  fechaFin: FechaISO | ''
  alCambiarFechaFin: (v: string) => void
  errores?: Record<string, string>
}) {
  const id = useId()

  return (
    <fieldset className="grupo-campo">
      <legend>¿Cómo se repite?</legend>
      <div className="field">
        <label htmlFor={`${id}-patron`}>Patrón</label>
        <select id={`${id}-patron`} name="patron" value={patron} onChange={(e) => alCambiarPatron(e.target.value as Patron)}>
          <option value="semanal">Cada semana, el mismo día</option>
          <option value="mensual_dia_fijo">Cada mes, el mismo día del mes</option>
          <option value="mensual_dia_semana">Cada mes, el mismo día de la semana (ej. el primer lunes)</option>
        </select>
      </div>

      {patron !== 'mensual_dia_fijo' && (
        <div className="field">
          <label htmlFor={`${id}-dia-semana`}>Día de la semana</label>
          <select id={`${id}-dia-semana`} name="dia_semana" value={diaSemana} onChange={(e) => alCambiarDiaSemana(e.target.value)}>
            <option value="">Elegí un día</option>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>
                {ETIQUETA_DIA_SEMANA[d]}
              </option>
            ))}
          </select>
          <ErrorCampo mensaje={errores?.dia_semana} />
        </div>
      )}

      {patron === 'mensual_dia_semana' && (
        <div className="field">
          <label htmlFor={`${id}-ordinal`}>Cuál</label>
          <select id={`${id}-ordinal`} name="ordinal_semana" value={ordinalSemana} onChange={(e) => alCambiarOrdinalSemana(e.target.value)}>
            <option value="">Elegí una opción</option>
            {['1', '2', '3', '4', '-1'].map((o) => (
              <option key={o} value={o}>
                {ETIQUETA_ORDINAL[o]}
              </option>
            ))}
          </select>
          <ErrorCampo mensaje={errores?.ordinal_semana} />
        </div>
      )}

      {patron === 'mensual_dia_fijo' && (
        <div className="field">
          <label htmlFor={`${id}-dia-mes`}>Día del mes</label>
          <input id={`${id}-dia-mes`} name="dia_mes" type="number" min={1} max={31} value={diaMes} onChange={(e) => alCambiarDiaMes(e.target.value)} />
          <ErrorCampo mensaje={errores?.dia_mes} />
        </div>
      )}

      <div className="field">
        <label htmlFor={`${id}-fecha-fin`}>Repetir hasta</label>
        <input id={`${id}-fecha-fin`} name="fecha_fin" type="date" required value={fechaFin} onChange={(e) => alCambiarFechaFin(e.target.value)} />
        <ErrorCampo mensaje={errores?.fecha_fin} />
      </div>
    </fieldset>
  )
}
```

- [ ] **Paso 2: `formulario-evento.tsx`** — interruptor en `FormularioNuevoEvento`

Agregar estado: `const [repite, setRepite] = useState(false)` + los campos de `CamposRecurrencia`
(`patron`, `diaSemana`, `ordinalSemana`, `diaMes`, `fechaFin`, todos `useState('')`/`useState<Patron>('semanal')`).
Agregar, antes de `<CamposTipoYCocina>`, un checkbox:

```tsx
<label className="opcion-pastilla">
  <input type="checkbox" checked={repite} onChange={(e) => setRepite(e.target.checked)} />
  <span>Este evento se repite</span>
</label>
{repite && (
  <CamposRecurrencia
    patron={patron}
    alCambiarPatron={setPatron}
    diaSemana={diaSemana}
    alCambiarDiaSemana={setDiaSemana}
    ordinalSemana={ordinalSemana}
    alCambiarOrdinalSemana={setOrdinalSemana}
    diaMes={diaMes}
    alCambiarDiaMes={setDiaMes}
    fechaFin={fechaFin}
    alCambiarFechaFin={setFechaFin}
    errores={campos}
  />
)}
```

El `useActionState` de `FormularioNuevoEvento` ya llama `crearEvento`; cuando `repite` está marcado
debe llamar `crearSerieEventos` en su lugar (mismo `formData`, ambas acciones leen los mismos nombres
de campo salvo que la serie además manda `patron`/`dia_semana`/`ordinal_semana`/`dia_mes`/`fecha_fin`
en vez de la `fecha` puntual — agregar `<input type="hidden" name="fecha_inicio" value={fecha} />` en
vez de `name="fecha"` cuando `repite` está marcado, reutilizando la `fecha` del día donde se abrió el
modal como fecha de inicio). El mensaje de éxito cambia a `` `Se crearon ${resultado.data.cantidad} eventos.` ``
en el caso de serie.

- [ ] **Paso 3: `modal-dia.tsx`** — botón "Cancelar toda la serie" en `FilaEvento` cuando
  `evento.serie_id` no es null, con el mismo patrón de confirmación inline que ya existe para
  "Eliminar" (estado `confirmandoSerie`, botones "Sí, cancelar la serie" / "Cancelar", llama
  `eliminarSerieDesdeHoy({ serie_id: evento.serie_id })`, aviso `` `Se cancelaron ${resultado.data.cantidad} eventos futuros de la serie.` ``).

- [ ] **Paso 4: verificación manual**

`npm run dev`, Director, crear una serie semanal, confirmar que aparecen varias ocurrencias en el mes;
editar una ocurrencia puntual (debe funcionar igual que un evento suelto); cancelar la serie completa
desde una de ellas y confirmar que las futuras desaparecen y las pasadas no.

- [ ] **Paso 5: commit**

```bash
git add app/\(app\)/calendario/_componentes/campos-recurrencia.tsx app/\(app\)/calendario/_componentes/formulario-evento.tsx app/\(app\)/calendario/_componentes/modal-dia.tsx
git commit -m "feat(calendario): UI para crear series recurrentes y cancelarlas hacia adelante"
```

---

### Tarea 6: e2e

**Archivos:**
- Modificar: `tests/e2e/calendario.spec.ts`

- [ ] **Paso 1: escribir el escenario**

```ts
test('el Director crea una serie semanal, edita una ocurrencia puntual y cancela el resto', async ({ page }) => {
  await iniciarSesion(page, 'director')
  await page.goto('/calendario')
  const hoy = fechaISOEn(new Date())
  await page.locator(`.cal-day[data-fecha="${hoy}"]`).click()
  const modal = page.getByRole('dialog')

  await modal.getByLabel('Título del evento').fill('San Rafael')
  await modal.getByLabel('San Rafael', { exact: true }).check()
  await modal.getByLabel('Este evento se repite').check()
  await modal.getByLabel('Día de la semana').selectOption('6') // sábado
  const fechaFin = fechaISOEn(new Date(Date.now() + 45 * 86_400_000))
  await modal.getByLabel('Repetir hasta').fill(fechaFin)
  await modal.getByRole('button', { name: 'Agregar evento' }).click()
  await expect(page.getByText(/Se crearon \d+ eventos\./)).toBeVisible()

  const { data: eventos } = await clienteAdminPrueba().from('eventos').select('id, fecha, serie_id').eq('titulo', 'San Rafael').order('fecha')
  expect(eventos!.length).toBeGreaterThan(1)
  const serieId = eventos![0].serie_id
  expect(serieId).not.toBeNull()

  // Editar una ocurrencia puntual: no toca las demás.
  const segunda = eventos![1]
  await page.reload()
  await page.locator(`.cal-day[data-fecha="${segunda.fecha}"]`).click()
  const modal2 = page.getByRole('dialog')
  await modal2.getByRole('button', { name: /^Editar/ }).click()
  await modal2.getByLabel('Título del evento').fill('San Rafael (cambiado)')
  await modal2.getByRole('button', { name: 'Guardar cambios' }).click()
  const { data: primeraSinTocar } = await clienteAdminPrueba().from('eventos').select('titulo').eq('id', eventos![0].id).single()
  expect(primeraSinTocar!.titulo).toBe('San Rafael')

  // Cancelar la serie completa desde hoy.
  await page.reload()
  await page.locator(`.cal-day[data-fecha="${hoy}"]`).click()
  const modal3 = page.getByRole('dialog')
  await modal3.getByRole('button', { name: 'Cancelar toda la serie' }).click()
  await modal3.getByRole('button', { name: /Sí, cancelar la serie/ }).click()
  await expect(page.getByText(/Se cancelaron \d+ eventos futuros/)).toBeVisible()

  const { data: quedan } = await clienteAdminPrueba().from('eventos').select('id').eq('serie_id', serieId!)
  expect(quedan!.length).toBe(1) // solo la de hoy, que ya pasó a estar "hoy" y no se toca según el filtro gte
})
```

- [ ] **Paso 2: correr y confirmar que pasa**

Correr: `npx playwright test tests/e2e/calendario.spec.ts -g "serie"`
Esperado: PASA.

- [ ] **Paso 3: commit**

```bash
git add tests/e2e/calendario.spec.ts
git commit -m "test(calendario): e2e de series recurrentes"
```

---

### Tarea 7: tipos de Supabase y apertura del PR

Mismo procedimiento que los planes hermanos:

```bash
git push -u origin HEAD
gh run download "$(gh run list --branch "$(git branch --show-current)" --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId')" -n database-types -D lib/supabase
git add lib/supabase/database.types.ts
git commit -m "chore(calendario): regenera database.types.ts"
git push
```

Abrir el PR, confirmar CI en verde. **No fusionar sin que el usuario lo revise y mergee.**
