# Administración: etiquetas de evento y nota de enfermo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Administración vea la categoría (San Rafael / San Gabriel / San Miguel / Otro) de los eventos que ya ve, y lo que puede comer quien marcó "Enfermo".

**Architecture:** La base agrega `tipo` a `eventos_para_cocina()`; `eventoParaAdministracion()` lo pasa y las pantallas del calendario lo pintan con las piezas que ya usa la casa (sin filtros). Los avisos push a la cocina nombran la categoría. En comidas, `resumenComida()` guarda las notas de texto en `parte.notas`, `CeldaResumen` las pinta y un ayudante `textoParte()` las lleva a los textos corridos.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (PostgreSQL + PostgREST), Vitest, Playwright, CSS plano en `app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-10-05-administracion-etiquetas-y-usuarios-design.md` §1 y §2.

**Rama:** `claude/administracion-etiquetas-enfermo` (ya creada desde `origin/master`, con el spec).

**Antes de empezar:** `npm run lint && npm run typecheck && npm test` en verde. Las pruebas de integración y e2e solo corren en el CI (no hay Docker ni `.env.local` en el worktree).

---

## Archivos

| Archivo | Qué cambia |
|---|---|
| `lib/comidas/resumen.ts` | `ParteResumen.notas`, plural de enfermo, `textoParte()` |
| `lib/comidas/casa.ts` | `etiquetaCeldaCasa()` usa `textoParte()` |
| `app/(app)/comidas/_componentes/celda-resumen.tsx` | pinta `parte.notas` |
| `app/globals.css` | `.nota-parte` |
| `supabase/migrations/20261005100000_eventos_cocina_tipo.sql` | **nuevo**: `eventos_para_cocina()` con `tipo` |
| `lib/supabase/database.types.ts` | `tipo` en el `Returns` de la RPC (a mano; después se reemplaza por el artefacto del CI) |
| `lib/calendario/tipos.ts` | `EventoParaCocina.tipo`, `eventoParaAdministracion()` |
| `lib/calendario/consultas.ts`, `lib/calendario/filtros.ts` | comentarios; `etiquetaDiaCalendario()` nombra los tipos para la cocina |
| `app/(app)/calendario/_componentes/insignias-evento.tsx`, `calendario-mes.tsx`, `modal-dia.tsx` | `soloTipo`, `data-listo` desde el servidor |
| `app/(app)/calendario/page.tsx` | comentario |
| `lib/push/cargas-casa.ts`, `lib/push/avisos-casa.ts` | la categoría en los avisos a la cocina |
| `app/(app)/calendario/acciones.ts` | los `select` de "cómo estaba" traen `tipo` |
| `tests/unit/…`, `tests/integration/calendario.test.ts`, `tests/e2e/calendario.spec.ts`, `tests/e2e/comidas.spec.ts` | pruebas |
| `CLAUDE.md`, `DESIGN.md` | reglas que cambian |

---

### Task 1: `resumenComida()` guarda las notas de texto

**Files:**
- Modify: `lib/comidas/resumen.ts`
- Test: `tests/unit/comidas/resumen.test.ts`

- [ ] **Step 1: Pruebas que fallan**

En `tests/unit/comidas/resumen.test.ts`, agregar `textoParte` al import de `@/lib/comidas/resumen` y **reemplazar** la prueba `'no muestra la nota de enfermo y nombra "en bolsa"'` por:

```ts
  it('nombra "en bolsa" y deja aparte, en `notas`, lo que puede comer quien está enfermo', () => {
    const resumen = resumenComida([v('enfermo', 'Solo sopa'), v('bolsa')])
    expect(resumen.partes).toEqual([
      { clave: 'bolsa', cantidad: 1, texto: '1 en bolsa' },
      { clave: 'enfermo', cantidad: 1, texto: '1 enfermo', notas: ['Solo sopa'] },
    ])
  })

  it('varios enfermos: plural, una nota por persona, en su orden y sin agrupar', () => {
    const resumen = resumenComida([v('enfermo', 'Sopa'), v('si'), v('enfermo', 'Dieta blanda'), v('enfermo', 'Sopa')])
    expect(resumen.partes.find((p) => p.clave === 'enfermo')).toEqual({
      clave: 'enfermo',
      cantidad: 3,
      texto: '3 enfermos',
      notas: ['Sopa', 'Dieta blanda', 'Sopa'],
    })
  })

  it('un enfermo sin nota no agrega `notas` (ni una lista vacía)', () => {
    const [parte] = resumenComida([v('enfermo'), v('enfermo', '   ')]).partes
    expect(parte).toEqual({ clave: 'enfermo', cantidad: 2, texto: '2 enfermos' })
    expect(parte).not.toHaveProperty('notas')
  })

  it('las horas no son notas: siguen en el texto', () => {
    expect(resumenComida([v('tarde', '13:30')]).partes[0]).not.toHaveProperty('notas')
  })
```

Y agregar, antes de `describe('textoResumen', …)`:

```ts
describe('textoParte', () => {
  it('sin notas, el texto corto', () => {
    expect(textoParte({ clave: 'si', cantidad: 2, texto: '2 sí' })).toBe('2 sí')
  })

  it('con notas, entre paréntesis y separadas por punto y coma', () => {
    const [parte] = resumenComida([v('enfermo', 'Sopa de pollo'), v('enfermo', 'Dieta blanda')]).partes
    expect(textoParte(parte)).toBe('2 enfermos (Sopa de pollo; Dieta blanda)')
  })
})
```

Y dentro de `describe('textoResumen', …)`:

```ts
  it('lleva las notas de enfermo', () => {
    expect(textoResumen(resumenComida([v('si'), v('enfermo', 'Sopa')]))).toBe('1 sí · 1 enfermo (Sopa)')
  })
```

- [ ] **Step 2: Ver que fallan**

Run: `npx vitest run --project unit tests/unit/comidas/resumen.test.ts`
Expected: FAIL (`textoParte` no existe; `notas` ausente; "2 enfermo").

- [ ] **Step 3: Implementar**

En `lib/comidas/resumen.ts`:

```ts
export type ParteResumen = {
  clave: ClaveResumen
  cantidad: number
  texto: string
  /** Lo que escribió cada persona en un estado con nota libre (enfermo: qué puede comer). Nunca nombres. */
  notas?: string[]
}
```

En `ETIQUETA_CORTA`:

```ts
  enfermo: (cantidad) => (cantidad === 1 ? 'enfermo' : 'enfermos'),
```

En `resumenComida()`, reemplazar el `partes.push({ clave: estado, … })` del bucle por:

```ts
    const parte: ParteResumen = { clave: estado, cantidad: delEstado.length, texto }
    if (INFO_ESTADO[estado].nota === 'texto') {
      const notas = delEstado.flatMap((valor) => {
        const nota = valor.nota?.trim()
        return nota ? [nota] : []
      })
      if (notas.length > 0) parte.notas = notas
    }
    partes.push(parte)
```

Y debajo de `resumenComida()`:

```ts
/** La parte en texto corrido, con sus notas: '1 enfermo (sopa de pollo)' · '2 enfermos (sopa; dieta blanda)'. */
export function textoParte(parte: ParteResumen): string {
  return parte.notas?.length ? `${parte.texto} (${parte.notas.join('; ')})` : parte.texto
}

export function textoResumen(resumen: ResumenComida): string {
  if (resumen.partes.length === 0) return 'Sin personas'
  return resumen.partes.map(textoParte).join(' · ')
}
```

Actualizar el comentario de `resumenComida()`: ya no dice "spec §6.5" a secas; agregar "Las notas de texto (enfermo) van en `notas`, sin nombre."

- [ ] **Step 4: Ver que pasan**

Run: `npx vitest run --project unit tests/unit/comidas/resumen.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/comidas/resumen.ts tests/unit/comidas/resumen.test.ts
git commit -m "feat(comidas): el resumen de la cocina guarda lo que puede comer quien está enfermo"
```

---

### Task 2: el nombre accesible de "La casa" dice las notas

**Files:**
- Modify: `lib/comidas/casa.ts` (`etiquetaCeldaCasa`, ~línea 85)
- Test: `tests/unit/comidas/casa.test.ts`

- [ ] **Step 1: Prueba que falla** — dentro de `describe('etiquetaCeldaCasa: …')`:

```ts
  it('lo que puede comer quien está enfermo también se dice: es parte de lo que se ve en la celda', () => {
    const conEnfermo = resumenComida([
      { estado: 'si', nota: null, origen: 'plan' },
      { estado: 'enfermo', nota: 'Sopa de pollo', origen: 'persona' },
    ])
    expect(etiquetaCeldaCasa('cena', 'Viernes', '25/9', conEnfermo)).toBe(
      'Cena del viernes 25/9: 2 comen. 1 enfermo (Sopa de pollo), 1 sí. Ver quiénes',
    )
  })
```

- [ ] **Step 2:** Run: `npx vitest run --project unit tests/unit/comidas/casa.test.ts` → FAIL (falta "(Sopa de pollo)").

- [ ] **Step 3: Implementar** — en `lib/comidas/casa.ts`, importar `textoParte` de `./resumen` y cambiar:

```ts
  const desglose = partesParaCocina(resumen).map(textoParte)
```

- [ ] **Step 4:** Run: el mismo comando → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/comidas/casa.ts tests/unit/comidas/casa.test.ts
git commit -m "feat(comidas): el nombre accesible de la celda de La casa incluye la nota de enfermo"
```

---

### Task 3: `CeldaResumen` pinta las notas

**Files:**
- Modify: `app/(app)/comidas/_componentes/celda-resumen.tsx`
- Modify: `app/globals.css` (junto a `.notas-extra`, ~línea 730)
- Test: `tests/unit/comidas/celda-resumen.test.ts`

- [ ] **Step 1: Pruebas que fallan** — **reemplazar** `'nunca muestra la nota de "enfermo", solo la cantidad'` por:

```ts
  it('lo que puede comer quien está enfermo va debajo de su línea, un renglón por persona', () => {
    const markup = html({ resumen: resumenComida([v('enfermo', 'Solo sopa'), v('enfermo', 'Dieta blanda')]) })
    expect(markup).toMatch(
      /<li class="parte" style="[^"]*--st-enfermo[^"]*"><svg class="icono"[^]*?<\/svg>2 enfermos<\/li><li class="nota-parte">Solo sopa<\/li><li class="nota-parte">Dieta blanda<\/li>/,
    )
  })

  it('las notas de enfermo también van como spans dentro de un botón', () => {
    const markup = html({ resumen: resumenComida([v('enfermo', 'Solo sopa')]), como: 'spans' })
    expect(markup).not.toMatch(/<(ul|li|div|p)\b/)
    expect(markup).toContain('<span class="nota-parte">Solo sopa</span>')
  })
```

- [ ] **Step 2:** Run: `npx vitest run --project unit tests/unit/comidas/celda-resumen.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — en `celda-resumen.tsx`, la rama final de `Parte` pasa a:

```tsx
  return (
    <>
      <Item className="parte" style={varsEstado(parte.clave)}>
        <Icono nombre={parte.clave} />
        {parte.texto}
      </Item>
      {/* Texto libre de cada persona (enfermo: qué puede comer). Sin nombre; el renglón parte, no se recorta. */}
      {parte.notas?.map((nota, indice) => (
        <Item key={indice} className="nota-parte">
          {nota}
        </Item>
      ))}
    </>
  )
```

Actualizar el comentario del componente: "…(temprano y a qué hora, tarde, en bolsa, enfermo y qué puede comer…), sin nombres."

En `app/globals.css`, después de `.notas-extra > *{display:block;}`:

```css
/* Lo que escribió quien está enfermo (qué puede comer): debajo de su línea, en letra normal. Es texto
   libre: ocupa el renglón entero y parte, no se recorta. */
.nota-parte{display:block;width:100%;box-sizing:border-box;margin-top:-.15rem;padding:0 .6rem;font-size:var(--t-sm);font-weight:400;line-height:1.35;color:var(--tinta);text-align:left;overflow-wrap:anywhere;}
```

(`width:100%` hace que, donde `.partes` va en fila —la tabla apilada en teléfono—, la nota tome su propio renglón.)

- [ ] **Step 4:** Run: el mismo comando → PASS. Después `npm test` completo → PASS (ninguna otra prueba esperaba "N enfermo" sin nota).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/comidas/_componentes/celda-resumen.tsx" app/globals.css tests/unit/comidas/celda-resumen.test.ts
git commit -m "feat(comidas): la cocina ve lo que puede comer quien está enfermo"
```

---

### Task 4: `eventos_para_cocina()` devuelve `tipo`

**Files:**
- Create: `supabase/migrations/20261005100000_eventos_cocina_tipo.sql`
- Modify: `lib/supabase/database.types.ts` (~línea 715)
- Test: `tests/integration/calendario.test.ts` (~línea 349; corre en el CI)

- [ ] **Step 1: Prueba de integración** — reemplazar la primera prueba de `describe('eventos_para_cocina: …')`:

```ts
  it('devuelve solo los eventos que piden algo, con fecha, hora, categoría y qué preparar; nunca el título', async () => {
    await sembrar()
    const cocina = await clienteComo('administracion')
    const { data, error } = await cocina.rpc('eventos_para_cocina', { p_desde: FECHA, p_hasta: FECHA })
    expect(error).toBeNull()
    expect(data).toEqual([
      {
        id: expect.any(String),
        fecha: FECHA,
        hora: '16:00:00',
        tipo: 'san_rafael',
        requiere_cocina: ['merienda', 'comida'],
        requiere_otro_texto: null,
      },
    ])
    // Ni títulos, ni la categoría del evento que no pide nada (san_gabriel).
    expect(JSON.stringify(data)).not.toMatch(/secreto|privada|retiro|reunion|san_gabriel/i)
  })
```

- [ ] **Step 2: Migración**

```sql
-- =========================================================
-- Calendario: Administración ve la categoría de los eventos que le piden algo.
--
-- eventos_para_cocina() devuelve además `tipo` (San Rafael / San Gabriel / San Miguel / Otro).
-- Sigue devolviendo solo los eventos con pedido, y nunca el título ni la serie.
-- Se suelta primero: create or replace no permite cambiar las columnas de un RETURNS TABLE.
-- =========================================================

drop function public.eventos_para_cocina(date, date);

create function public.eventos_para_cocina(p_desde date, p_hasta date)
returns table (
  id uuid,
  fecha date,
  hora time,
  tipo public.tipo_evento,
  requiere_cocina public.requerimiento_cocina[],
  requiere_otro_texto text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.fecha, e.hora, e.tipo, e.requiere_cocina, e.requiere_otro_texto
  from public.eventos e
  where (select public.soy_activo())
    and e.fecha between p_desde and p_hasta
    and (cardinality(e.requiere_cocina) > 0 or e.requiere_otro_texto is not null)
  order by e.fecha, e.hora nulls first, e.id
$$;

revoke execute on function public.eventos_para_cocina(date, date) from public, anon;
grant execute on function public.eventos_para_cocina(date, date) to authenticated, service_role;
```

Si la función tenía un `comment on function` en alguna migración anterior (`grep -rn "comment on function public.eventos_para_cocina" supabase/migrations`), repetirlo acá con el texto al día.

- [ ] **Step 3: Probar en el banco SQL local** (memoria `banco-sql-local`; `banco/montar.mjs`): montar una base con todas las migraciones, sembrar los tres eventos de `sembrar()` y, como una cuenta de Administración activa, comprobar que `select * from eventos_para_cocina('2026-10-07','2026-10-07')` devuelve una fila con `tipo = san_rafael` y las seis columnas; como `anon`, que falla con 42501; como cuenta inactiva, cero filas. Guardar el script en el scratchpad, no en el repo.

- [ ] **Step 4: Tipos** — en `lib/supabase/database.types.ts`, en `eventos_para_cocina.Returns`, agregar al final (orden alfabético, como lo genera Supabase):

```ts
          tipo: Database["public"]["Enums"]["tipo_evento"]
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261005100000_eventos_cocina_tipo.sql lib/supabase/database.types.ts tests/integration/calendario.test.ts
git commit -m "feat(calendario): eventos_para_cocina devuelve la categoría del evento"
```

---

### Task 5: `eventoParaAdministracion()` pasa el tipo

**Files:**
- Modify: `lib/calendario/tipos.ts`, `lib/calendario/consultas.ts` (comentario)
- Test: `tests/unit/calendario/tipos.test.ts`

- [ ] **Step 1: Pruebas que fallan** — en `describe('eventoParaAdministracion', …)`: agregar `tipo: 'san_gabriel'` a `desdeLaBase` y reemplazar las dos pruebas:

```ts
  it('deja fecha, hora, categoría y qué preparar; el título combina lo fijo con lo libre', () => {
    expect(eventoParaAdministracion({ ...desdeLaBase, requiere_otro_texto: '20 sillas extra' })).toEqual({
      id: 'e1',
      fecha: '2026-10-07',
      hora: '16:00:00',
      titulo: 'Merienda y comida · 20 sillas extra',
      tipo: 'san_gabriel',
      requiere_cocina: ['merienda', 'comida'],
      requiere_otro_texto: '20 sillas extra',
      serie_id: null,
    })
  })

  it('no arrastra ningún campo que la base no le dio: nunca un título real ni la serie', () => {
    const conDatosDeMas = { ...desdeLaBase, titulo: 'Retiro secreto', serie_id: 's1' } as EventoParaCocina
    const resultado = eventoParaAdministracion(conDatosDeMas)
    expect(resultado.titulo).toBe('Merienda y comida')
    expect(resultado.serie_id).toBeNull()
    expect(JSON.stringify(resultado)).not.toContain('secreto')
  })
```

- [ ] **Step 2:** Run: `npx vitest run --project unit tests/unit/calendario/tipos.test.ts` → FAIL (`tipo` sale null).

- [ ] **Step 3: Implementar** — en `lib/calendario/tipos.ts`:

```ts
/** Lo único que Administración ve de un evento: cuándo, de qué categoría y qué preparar (`eventos_para_cocina`). */
export type EventoParaCocina = {
  id: string
  fecha: FechaISO
  hora: string | null
  tipo: TipoEvento
  requiere_cocina: RequerimientoCocina[]
  requiere_otro_texto: string | null
}
```

```ts
/** El evento tal como lo ve Administración: sin título, con su categoría y lo que debe preparar como texto. */
export function eventoParaAdministracion(e: EventoParaCocina): Evento {
  return {
    id: e.id,
    fecha: e.fecha,
    hora: e.hora,
    titulo: textoPedido(e.requiere_cocina, e.requiere_otro_texto),
    tipo: e.tipo,
    requiere_cocina: e.requiere_cocina,
    requiere_otro_texto: e.requiere_otro_texto,
    serie_id: null,
  }
}
```

Comentarios al día en el mismo archivo:
- `varsTipo`: quitar "Solo para quien conoce el tipo: Administración nunca lo recibe."
- `Evento`: "Administración no conoce de qué son los eventos: a ella `titulo` le llega como el resumen de lo que debe preparar. Sí recibe `tipo`. Nunca hay un título real en un evento de Administración. `tipo` es null solo en un formulario donde todavía no se eligió."

En `lib/calendario/consultas.ts`, el comentario de `listarEventosDeCuadricula`: "…lee solo `eventos_para_cocina` (los que piden algo, con su categoría y sin título)."

- [ ] **Step 4:** Run: el mismo comando → PASS. `npm run typecheck` → falla en `lib/push/…` y pruebas que arman un `PedidoCocina` sin `tipo`: se arregla en la Task 7 (no commitear rojo: seguir con las Tasks 6 y 7 y commitear cuando `typecheck` pase, o hacer la Task 7 antes del commit de esta).

- [ ] **Step 5: Commit** (junto con la Task 7 si `typecheck` no pasa todavía)

```bash
git add lib/calendario/tipos.ts lib/calendario/consultas.ts tests/unit/calendario/tipos.test.ts
git commit -m "feat(calendario): el evento de Administración lleva su categoría"
```

---

### Task 6: el calendario de Administración pinta la categoría

**Files:**
- Modify: `lib/calendario/filtros.ts` (`etiquetaDiaCalendario`, comentarios)
- Modify: `app/(app)/calendario/_componentes/insignias-evento.tsx`, `calendario-mes.tsx`, `modal-dia.tsx`
- Modify: `app/(app)/calendario/page.tsx` (comentario)
- Test: `tests/unit/calendario/filtros.test.ts`, `tests/e2e/calendario.spec.ts`

- [ ] **Step 1: Prueba unitaria que falla** — en `tests/unit/calendario/filtros.test.ts`, reemplazar `'Administración: pedidos para la cocina, sin tipos (nunca los conoce)'`:

```ts
  it('Administración: cuántos pedidos para la cocina y de qué categoría', () => {
    const pedido = evento('a', 'san_rafael', { requiere_cocina: ['merienda'] })
    const otroPedido = evento('b', 'san_gabriel', { requiere_cocina: ['comida'] })
    expect(etiquetaDiaCalendario({ ...base, visibles: [pedido], paraCocina: true })).toBe(
      `${dia}, 1 pedido para la cocina: San Rafael`,
    )
    expect(etiquetaDiaCalendario({ ...base, visibles: [pedido, otroPedido, pedido], paraCocina: true })).toBe(
      `${dia}, 3 pedidos para la cocina: San Rafael y San Gabriel`,
    )
  })
```

- [ ] **Step 2:** Run: `npx vitest run --project unit tests/unit/calendario/filtros.test.ts` → FAIL.

- [ ] **Step 3: `etiquetaDiaCalendario`** — en `lib/calendario/filtros.ts`, el bloque `if (paraCocina) … else if (cantidad > 0) …` pasa a:

```ts
  if (cantidad > 0) {
    const tipos = [...new Set(visibles.flatMap((e) => (e.tipo ? [ETIQUETA_TIPO[e.tipo]] : [])))]
    const deQue = tipos.length ? `: ${enumerar(tipos)}` : ''
    const que = paraCocina
      ? `${cantidad === 1 ? 'pedido' : 'pedidos'} para la cocina`
      : cantidad === 1
        ? 'evento'
        : 'eventos'
    partes.push(`${cantidad} ${que}${deQue}`)
  }
```

Comentarios del archivo al día: cabecera ("Administración no tiene filtros: nunca se le oculta nada"), `eventoVisible` y el de `etiquetaDiaCalendario` ("Administración: cuántos pedidos para la cocina y de qué categoría").

- [ ] **Step 4:** Run: el mismo comando → PASS.

- [ ] **Step 5: `InsigniasEvento` con `soloTipo`**

```tsx
/**
 * De qué tipo es el evento (en su color, con su marca) y qué le pide a la cocina. `soloTipo`
 * (Administración): su título ya es el resumen de lo que debe preparar, así que el pedido no se
 * repite en pastillas. `oculto`: el evento está oculto por los filtros y se ve porque se pidió en el día.
 */
export function InsigniasEvento({
  evento,
  oculto = false,
  soloTipo = false,
}: {
  evento: Evento
  oculto?: boolean
  soloTipo?: boolean
}) {
  if (evento.tipo === null) return null
  const pedidos = soloTipo ? [] : REQUERIMIENTOS_COCINA.filter((r) => evento.requiere_cocina.includes(r))
```

(el resto del componente no cambia).

- [ ] **Step 6: `calendario-mes.tsx`**

```tsx
    // data-listo: ya hidratado con los filtros de este dispositivo (antes, el CSS esconde lo guardado).
    // Sin filtros (Administración) sale listo desde el servidor: lo que otra persona haya ocultado en
    // este dispositivo no le esconde nada, ni un instante.
    <div className="zona-calendario" data-listo={listo || !conFiltros ? '' : undefined}>
```

En la agenda: `<InsigniasEvento evento={evento} soloTipo={paraCocina} />`.

Comentarios al día: `atributosEvento` ("Solo si el evento trae tipo: un evento sin tipo se pinta sin nada de esto."), el del componente ("Administración no los tiene [los filtros]; sus eventos sí llevan color y marca") y la prop `paraCocina` ("solo ve lo que debe preparar la cocina, con su categoría y sin título").

- [ ] **Step 7: `modal-dia.tsx`** — `FilaEvento` recibe `soloTipo: boolean` y lo pasa: `<InsigniasEvento evento={evento} oculto={ocultoPor !== null} soloTipo={soloTipo} />`. En `ModalDia`, donde se pinta cada `<FilaEvento …>`, agregar `soloTipo={paraCocina}`.

- [ ] **Step 8: `page.tsx`** — el comentario sobre `conFiltros` pasa a: "Administración no tiene filtros: ve todo lo que le piden, con su categoría."

- [ ] **Step 9: E2E** (corre en el CI) — en `tests/e2e/calendario.spec.ts`, reemplazar la prueba `'Administración ve lo que la cocina debe preparar, sin título ni tipo'` por:

```ts
test('Administración ve lo que la cocina debe preparar con la categoría del evento, sin título', async ({ page }) => {
  const ids = await asegurarUsuariosPrueba()
  const hoy = fechaISOEn(new Date())
  const { error } = await clienteAdminPrueba()
    .from('eventos')
    .insert([
      { titulo: 'Retiro secreto', fecha: hoy, hora: '16:00', tipo: 'san_rafael', requiere_cocina: ['merienda', 'comida'], creado_por: ids.director },
      { titulo: 'Reunión privada', fecha: hoy, hora: '09:00', tipo: 'san_gabriel', requiere_cocina: [], creado_por: ids.director },
    ])
  expect(error).toBeNull()

  await iniciarSesion(page, 'administracion')
  // Aunque el dispositivo tenga filtros guardados (lo usó antes alguien de la casa), a la cocina no le aplican…
  await page.evaluate(() => localStorage.setItem('molino-calendario', '{"ocultos":["san_rafael","sin_pedido"]}'))
  // …ni un instante: el HTML del servidor ya sale "listo", así el CSS previo a la hidratación no esconde nada.
  const respuesta = await page.request.get('/calendario')
  expect(await respuesta.text()).toMatch(/class="zona-calendario" data-listo=""/)
  await page.goto('/calendario')
  await expect(page.getByText('Lo que la casa necesita de la cocina')).toBeVisible()

  // Sin filtros: ni chips ni aviso de ocultos.
  await expect(page.getByRole('region', { name: 'Filtros' })).toHaveCount(0)
  await expect(page.getByRole('switch')).toHaveCount(0)
  await expect(page.locator('.chip-filtro, .aviso-filtros')).toHaveCount(0)

  // El pedido, con el color y la marca escrita de su categoría.
  const celdaHoy = page.locator(`.cal-day[data-fecha="${hoy}"]`)
  const evento = celdaHoy.locator('.cal-event')
  await expect(evento).toHaveText(['16:00 Merienda y comida'])
  await expect(evento).toBeVisible()
  await expect(evento).toHaveAttribute('data-tipo', 'san_rafael')
  await expect(evento).toHaveAttribute('data-marca', 'SR')
  await expect(celdaHoy).toHaveAttribute('aria-label', /, 1 pedido para la cocina: San Rafael$/)

  await celdaHoy.click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByText('Merienda y comida')).toBeVisible()
  await expect(modal.getByText('16:00')).toBeVisible()
  await expect(modal.locator('.pastilla-tipo')).toHaveText('San Rafael')
  // El pedido ya es el texto del evento: no se repite en pastillas.
  await expect(modal.locator('.pastilla-cocina')).toHaveCount(0)
  // El evento que no pide nada a la cocina no aparece, ni su hora.
  await expect(modal.getByText('09:00')).toHaveCount(0)
  await expect(modal.getByText(/ocultos? por los filtros/)).toHaveCount(0)

  // Ni los títulos ni la categoría del evento sin pedido llegan al navegador, ni en pantalla ni en los datos.
  const html = await page.content()
  for (const secreto of ['Retiro secreto', 'Reunión privada', 'San Gabriel', 'San Miguel', 'Estás ocultando']) {
    expect(html, `"${secreto}" no debería llegar a Administración`).not.toContain(secreto)
  }
  await expect(modal.getByLabel('Título del evento')).toHaveCount(0)
})
```

Revisar las otras pruebas de Administración del archivo (`'Administración ve el pedido libre…'` y siguientes): si alguna afirma que no hay `[data-tipo]`, `[data-marca]` o `.marca-tipo`, ajustarla igual.

- [ ] **Step 10:** `npm run lint` y `npx vitest run --project unit tests/unit/calendario` → PASS.

- [ ] **Step 11: Commit** (cuando `npm run typecheck` pase; si todavía falla por la Task 7, commitear las dos juntas)

```bash
git add lib/calendario/filtros.ts "app/(app)/calendario" tests/unit/calendario/filtros.test.ts tests/e2e/calendario.spec.ts
git commit -m "feat(calendario): Administración ve la categoría de los eventos que le piden algo"
```

---

### Task 7: los avisos a la cocina nombran la categoría

**Files:**
- Modify: `lib/push/cargas-casa.ts`, `lib/push/avisos-casa.ts` (comentario)
- Modify: `app/(app)/calendario/acciones.ts`
- Test: `tests/unit/push/cargas-casa.test.ts`, `tests/unit/push/avisos-casa.test.ts`, `tests/unit/calendario/acciones.test.ts`

- [ ] **Step 1: Pruebas que fallan** — en `tests/unit/push/cargas-casa.test.ts`:

La fábrica `pedido()` gana `tipo: 'otro'` (no se nombra: las cadenas esperadas de las pruebas que ya existen no cambian):

```ts
  const pedido = (cambios: Partial<PedidoCocina> = {}): PedidoCocina => ({
    fecha: '2026-10-01',
    hora: '15:00:00',
    tipo: 'otro',
    requiere_cocina: ['merienda'],
    requiere_otro_texto: null,
    ...cambios,
  })
```

Pruebas nuevas en el mismo `describe`:

```ts
  it('nombra la categoría junto al cuándo; "Otro" no se nombra (no le dice nada a la cocina)', () => {
    const rafael = pedido({ tipo: 'san_rafael' })
    expect(cargaPedidoCocina({ id: 'e1', tipo: 'nuevo', antes: null, despues: rafael, hoy: HOY }).cuerpo).toBe(
      'Jueves 1/10, 15:00 · San Rafael: Merienda.',
    )
    expect(cargaPedidoCocina({ id: 'e1', tipo: 'cancelado', antes: rafael, despues: null, hoy: HOY }).cuerpo).toBe(
      'Jueves 1/10, 15:00 · San Rafael: Merienda.',
    )
    expect(
      cargaPedidoCocina({ id: 'e1', tipo: 'cambiado', antes: rafael, despues: { ...rafael, hora: '16:30' }, hoy: HOY }).cuerpo,
    ).toBe('Ahora: Jueves 1/10, 16:30 · San Rafael: Merienda (antes: jueves 1/10, 15:00).')
    expect(
      cargaPedidoCocina({ id: 'e1', tipo: 'cambiado', antes: rafael, despues: { ...rafael, requiere_cocina: ['comida'] }, hoy: HOY })
        .cuerpo,
    ).toBe('Jueves 1/10, 15:00 · San Rafael: ahora Comida (antes: Merienda).')
    expect(
      cargaPedidoCocina({
        id: 'e1',
        tipo: 'cambiado',
        antes: rafael,
        despues: { ...rafael, fecha: '2026-09-30', hora: null, requiere_cocina: ['materiales'] },
        hoy: HOY,
      }).cuerpo,
    ).toBe('Ahora: Mañana · San Rafael: Utensilios y materiales. Antes: Jueves 1/10, 15:00: Merienda.')
  })

  it('un cambio solo de categoría no es un cambio para la cocina', () => {
    expect(cambioPedidoCocina(pedido({ tipo: 'san_rafael' }), pedido({ tipo: 'san_miguel' }), HOY)).toBeNull()
  })

  it('una serie nombra la categoría si todas sus fechas la comparten', () => {
    const fechas = ['2026-10-01', '2026-10-08']
    expect(
      cargaSeriePedidos({ serieId: 's1', accion: 'creada', pedidos: fechas.map((fecha) => pedido({ fecha, tipo: 'san_gabriel' })) })
        .cuerpo,
    ).toBe('Del 1 al 8 de octubre, a las 15:00 · San Gabriel: Merienda.')
    expect(
      cargaSeriePedidos({
        serieId: 's1',
        accion: 'creada',
        pedidos: [pedido({ fecha: fechas[0], tipo: 'san_gabriel' }), pedido({ fecha: fechas[1], tipo: 'san_miguel' })],
      }).cuerpo,
    ).toBe('Del 1 al 8 de octubre, a las 15:00: Merienda.')
  })
```

Reemplazar `'nunca lleva títulos, categorías ni nombres aunque el objeto los traiga'`:

```ts
  it('nunca lleva títulos ni nombres aunque el objeto los traiga; la categoría sí, escrita', () => {
    const conDeMas = { ...pedido({ tipo: 'san_rafael' }), titulo: 'Cumpleaños de Juan Pérez', creado_por: 'Directora Prueba' }
    const cargas = [
      cargaPedidoCocina({ id: 'e1', tipo: 'nuevo', antes: null, despues: conDeMas, hoy: HOY }),
      cargaPedidoCocina({ id: 'e1', tipo: 'cambiado', antes: conDeMas, despues: { ...conDeMas, hora: '18:00' }, hoy: HOY }),
      cargaSeriePedidos({ serieId: 's1', accion: 'creada', pedidos: [conDeMas] }),
    ]
    for (const carga of cargas) {
      const json = JSON.stringify(carga)
      expect(json).not.toMatch(/Cumpleaños|Juan|Pérez|san_rafael|Directora/)
      expect(carga.cuerpo).toContain('San Rafael')
      expect(Array.from(carga.cuerpo).length).toBeLessThanOrEqual(LARGO_MAXIMO_CUERPO)
    }
  })
```

En `describe('paraCocina / importaALaCocina', …)`: `tipo: 'san_rafael' as const` en `evento`, el resultado esperado de `paraCocina(evento)` gana `tipo: 'san_rafael'`, y `base` gana `tipo: 'otro'`. Cambiar el título de la prueba `'sin cambio para la cocina (solo el título o la categoría, o sin pedido), nada'` no hace falta.

- [ ] **Step 2:** Run: `npx vitest run --project unit tests/unit/push/cargas-casa.test.ts` → FAIL.

- [ ] **Step 3: Implementar `lib/push/cargas-casa.ts`**

Import: `import { ETIQUETA_TIPO, REQUERIMIENTOS_COCINA, textoPedido, type EventoParaCocina } from '@/lib/calendario/tipos'`.

Comentario de cabecera: "Los de la cocina reciben solo lo que Administración puede ver (fecha, hora, categoría, comida, cantidad, pedido o nota): nunca un título ni un nombre."

```ts
/** Lo que la cocina sabe de un evento (`eventos_para_cocina()` sin el id): cuándo, de qué categoría y qué preparar. */
export type PedidoCocina = Omit<EventoParaCocina, 'id'>
```

```ts
/**
 * De un evento completo (con título, serie…), solo lo que la cocina puede saber. Las acciones pasan
 * por acá antes de programar el aviso: así el título ni siquiera llega a la función que lo arma.
 */
export function paraCocina(e: PedidoCocina): PedidoCocina {
  return { fecha: e.fecha, hora: e.hora, tipo: e.tipo, requiere_cocina: e.requiere_cocina, requiere_otro_texto: e.requiere_otro_texto }
}
```

Debajo de `cuandoHora()`:

```ts
/** ' · San Gabriel': la categoría, junto al cuándo. "Otro" no se nombra: no le dice nada a la cocina. */
function categoriaDe(e: PedidoCocina): string {
  const etiqueta = e.tipo === 'otro' ? undefined : ETIQUETA_TIPO[e.tipo]
  return etiqueta ? ` · ${etiqueta}` : ''
}

/** 'Jueves 1/10, 15:00 · San Gabriel' */
function cuandoYCategoria(e: PedidoCocina, hoy: FechaISO): string {
  return `${cuandoHora(e, hoy)}${categoriaDe(e)}`
}

/** 'Jueves 1/10, 15:00 · San Gabriel: Merienda · 20 sillas' */
function textoEvento(e: PedidoCocina, hoy: FechaISO): string {
  return `${cuandoYCategoria(e, hoy)}: ${pedidoDe(e)}`
}
```

En `cambioPedidoCocina`: comentario "…un cambio de título o categoría no le cambia nada" (sin cambios de código).

En `cargaPedidoCocina`, rama `cambiado`:

```ts
    if (mismoPedido) {
      cuerpo = `Ahora: ${textoEvento(despues, hoy)} (antes: ${enMinuscula(cuandoHora(antes, hoy))}).`
    } else if (mismoCuando) {
      cuerpo = `${cuandoYCategoria(despues, hoy)}: ahora ${pedidoDe(despues)} (antes: ${pedidoDe(antes)}).`
    } else {
      // La categoría, una sola vez: en lo que vale ahora.
      cuerpo = `Ahora: ${textoEvento(despues, hoy)}. Antes: ${cuandoHora(antes, hoy)}: ${pedidoDe(antes)}.`
    }
```

En `cargaSeriePedidos`:

```ts
  const categorias = new Set(pedidos.map(categoriaDe))
  const categoria = categorias.size === 1 ? categoriaDe(pedidos[0]) : ''
  const cuerpo =
    textos.size === 1
      ? `${rango}${hora}${categoria}: ${pedidoDe(pedidos[0])}.`
      : `${rango}${categoria}: pedidos distintos, miralos en el calendario.`
```

- [ ] **Step 4:** Run: el mismo comando → PASS.

- [ ] **Step 5: Acciones** — en `app/(app)/calendario/acciones.ts`:
  - `editarEvento`: `.select('fecha, hora, tipo, requiere_cocina, requiere_otro_texto')`
  - `eliminarEvento` y `eliminarSerieDesdeHoy`: `.select('id, fecha, hora, tipo, requiere_cocina, requiere_otro_texto')`
  - Comentario de `avisarCocinaSiPide`: "…solo con paraCocina(): el título y la serie nunca llegan al aviso."

  En `lib/push/avisos-casa.ts`, comentario de `avisarPedidoCocina`: "…pasa por `paraCocina()` y el título o quien lo creó nunca llegan al texto."

- [ ] **Step 6: Pruebas que acompañan**
  - `tests/unit/calendario/acciones.test.ts`: `PARA_COCINA` gana `tipo: 'san_rafael'`; las columnas esperadas pasan a `'fecha, hora, tipo, requiere_cocina, requiere_otro_texto'` e `'id, fecha, hora, tipo, requiere_cocina, requiere_otro_texto'`; cada fila simulada de "cómo estaba" y cada `antes` esperado ganan `tipo: 'san_rafael'` (también en las pruebas de series de más abajo). El título del `describe` pasa a "…solo cuándo, categoría y qué; nunca el título".
  - `tests/unit/push/avisos-casa.test.ts`: `NOMBRES` deja de incluir `San Rafael` (queda `san_rafael`, el código); `evento.tipo` pasa a `'san_rafael' as const`; el cuerpo esperado es `'Jueves 1/10, 15:00 · San Rafael: Merienda.'`; `otroTitulo` usa `tipo: 'otro' as const` (sigue sin avisar: cambio solo de título y categoría). En la prueba de la serie, cada pedido gana `tipo: 'san_miguel' as const`, el cuerpo esperado es `'Del 6 al 20 de octubre · San Miguel: Comida.'` y el `not.toMatch` final queda en `/Retiro/`.

- [ ] **Step 7:** Run: `npm run lint && npm run typecheck && npm test` → todo PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/push "app/(app)/calendario/acciones.ts" tests/unit/push tests/unit/calendario/acciones.test.ts
git commit -m "feat(push): los avisos a la cocina nombran la categoría del evento"
```

---

### Task 8: E2E de la nota de enfermo

**Files:**
- Test: `tests/e2e/comidas.spec.ts` (después de `'Administración ve en Plan semanal cuántos comen y cómo, sin nombres'`)

- [ ] **Step 1: Agregar la prueba** (corre en el CI)

```ts
test('Administración ve qué puede comer quien está enfermo, sin saber quién es', async ({ page }) => {
  const { error } = await clienteAdminPrueba()
    .from('plan_semanal')
    .insert([
      { usuario_id: ids.residente, dia_semana: 3, comida: 'almuerzo', estado: 'enfermo', nota: 'Sopa de pollo' },
      { usuario_id: ids.residente2, dia_semana: 3, comida: 'almuerzo', estado: 'enfermo', nota: 'Dieta blanda' },
    ])
  expect(error).toBeNull()

  await iniciarSesion(page, 'administracion')
  await page.goto('/comidas/plan')
  const celda = page.locator('.admin-week-table td[data-dia="3"][data-comida="almuerzo"]')
  await expect(celda.locator('.parte').first()).toHaveText('2 enfermos')
  // Una nota por persona, sin nombre (el orden es el de las personas: no se afirma).
  await expect(celda.locator('.nota-parte')).toHaveCount(2)
  await expect(celda).toContainText('Sopa de pollo')
  await expect(celda).toContainText('Dieta blanda')
  await sinNombresAjenos(page, 'administracion')
})
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/comidas.spec.ts
git commit -m "test(e2e): Administración ve la nota de enfermo en el plan semanal"
```

---

### Task 9: documentación

**Files:**
- Modify: `CLAUDE.md`, `DESIGN.md`, `docs/superpowers/specs/2026-10-05-administracion-etiquetas-y-usuarios-design.md`

- [ ] **Step 1: `CLAUDE.md`** — cuatro frases:
  - "…"2 temprano (06:30 ×2)", en bolsa, enfermo solo como cantidad)" → "…en bolsa, enfermo con lo que puede comer —la nota en `parte.notas`, nunca quién—)".
  - "Tampoco ve colores, marcas ni filtros de categoría en el calendario, ni lee ausencias (solo `ausentes_en()`)." → "De un evento ve la categoría (color y marca), nunca el título; no tiene filtros en el calendario ni lee ausencias (solo `ausentes_en()`)."
  - "Administración ve el pedido, nunca el título ni la categoría." → "Administración ve el pedido y la categoría, nunca el título."
  - "**Todo lo que va a Administración pasa por `paraCocina()`** (`lib/push/cargas-casa.ts`): solo fecha, hora, cantidad y pedido." → "…: solo fecha, hora, categoría, cantidad y pedido."

- [ ] **Step 2: `DESIGN.md`** — buscar `Administración` en las secciones del calendario (`grep -n "Administración" DESIGN.md`): donde diga que no recibe el tipo, que los chips "delatarían la categoría" o que sus eventos no llevan `data-tipo` / `data-marca`, dejarlo así: Administración recibe el tipo de los eventos con pedido y lo ve con el mismo color y marca; sigue sin filtros (ve todo lo que le piden) y `.zona-calendario` le sale `data-listo` desde el servidor. En la sección del desglose de la cocina, agregar la línea de `.nota-parte`.

- [ ] **Step 3: Spec** — en §1 "Avisos push a la cocina", agregar a la primera viñeta: "«Otro» no se nombra en el aviso: no le dice nada a la cocina."

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md DESIGN.md docs/superpowers/specs/2026-10-05-administracion-etiquetas-y-usuarios-design.md
git commit -m "docs: Administración ve la categoría del evento y la nota de enfermo"
```

---

### Task 10: verificación y PR

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm test` → PASS. Build con variables de prueba, como el CI: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=ci SUPABASE_SECRET_KEY=ci npm run build` → PASS.

- [ ] **Step 2: Ver las pantallas** (sin backend): un arnés fuera del repo (scratchpad) que renderice con `react-dom/server` los componentes reales —`CeldaResumen` dentro de la tabla de Administración y de un botón `.celda-casa`, con 1 y 2 enfermos y una nota de 200 caracteres; `CalendarioMes` con `paraCocina` y eventos de los cuatro tipos— sobre `app/globals.css`. Mirarlo a 320 / 375 / 768 / 1280 px en claro, oscuro, alto contraste y letra enorme (`data-theme`, `data-contraste`, `data-texto` en `<html>`). Comprobar: la nota parte en renglones y no desborda; nada baja de `--t-xs`; la marca SR/SG/SM se lee en los cuatro modos.

- [ ] **Step 3:** `git push -u origin claude/administracion-etiquetas-enfermo` y abrir el PR contra `master`. El cuerpo explica lo que ve cada rol, incluye el SQL de la migración y dice **"aplicar la migración antes de mergear"**.

- [ ] **Step 4:** Esperar el CI (`gh run watch <id> --exit-status`; `calidad` y `base-de-datos`). Cuando `base-de-datos` suba el artefacto: `rm lib/supabase/database.types.ts` y `gh run download <run-id> -n database-types -D lib/supabase`; si difiere de lo editado a mano, commitear y volver a esperar el CI.

- [ ] **Step 5:** Pasarle al usuario el enlace del PR, el SQL para pegar y el orden (migración → merge).
