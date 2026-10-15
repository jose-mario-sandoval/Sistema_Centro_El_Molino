import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { guardarNotaDieta, guardarPlan, guardarSeleccion, volverAPlan } from '@/app/(app)/comidas/acciones'
import { agregarExtra, quitarExtra } from '@/app/(app)/comidas/casa/acciones'
import { fallo } from '@/lib/acciones/resultado'
import { perfilParaAccion, type Perfil } from '@/lib/auth/sesion'
import { obtenerHorasLimite } from '@/lib/comidas/consultas'
import { HORAS_LIMITE_POR_DEFECTO } from '@/lib/comidas/tipos'
import { avisarCambioDelDirector, avisarExtraCocina } from '@/lib/push/avisos-casa'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { clienteSupabaseFalso, perfilDePrueba } from '@/tests/soporte/supabase-falso'

// Las acciones se prueban sin base: sesión, cliente de Supabase y caché de Next se reemplazan.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/sesion', () => ({ perfilParaAccion: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ crearClienteAdmin: vi.fn() }))
vi.mock('@/lib/supabase/servidor', () => ({ crearClienteServidor: vi.fn() }))
vi.mock('@/lib/comidas/consultas', () => ({ obtenerHorasLimite: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/push/avisos-casa', () => ({ avisarCambioDelDirector: vi.fn(), avisarExtraCocina: vi.fn() }))

const { revalidatePath } = await import('next/cache')
const { after } = await import('next/server')

/** Corre lo que la acción dejó programado con after() (el aviso push). */
async function correrAfter() {
  for (const [tarea] of vi.mocked(after).mock.calls) await (tarea as () => Promise<void>)()
}

const DIRECTOR = perfilDePrueba('0b8f7c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', 'director')
const RESIDENTE = perfilDePrueba('6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b', 'residente')
const ADMINISTRACION = perfilDePrueba('9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', 'administracion')
const OTRA = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f'
const SIN_PERMISO = { ok: false, error: 'No tenés permiso para hacer esto.' }

/** perfilParaAccion de verdad mira los roles pedidos: el falso también. */
function sesionDe(perfil: Perfil) {
  vi.mocked(perfilParaAccion).mockImplementation(async (...roles) =>
    roles.length > 0 && !roles.includes(perfil.rol) ? fallo('No tenés permiso para hacer esto.') : { ok: true, perfil },
  )
}

function usarCliente(falso: ReturnType<typeof clienteSupabaseFalso>) {
  vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
  return falso
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-16T08:00:00-06:00'))
  vi.mocked(obtenerHorasLimite).mockResolvedValue(HORAS_LIMITE_POR_DEFECTO)
})

afterEach(() => vi.useRealTimers())

const SELECCION = { fecha: '2026-09-30', comida: 'almuerzo', estado: 'no', nota: null }

describe('guardarNotaDieta', () => {
  it.each([DIRECTOR, RESIDENTE])('guarda la nota propia normalizada de $rol', async (perfil) => {
    sesionDe(perfil)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await guardarNotaDieta({ nota: '  Indicaciones generales\nOtra línea  ' })).toEqual({ ok: true, data: null })
    expect(falso.rpcs).toEqual([{ nombre: 'guardar_nota_dieta_de', args: {
      p_usuario: perfil.id, p_nota: 'Indicaciones generales\nOtra línea',
    } }])
    expect(revalidatePath).toHaveBeenCalledWith('/comidas', 'layout')
  })

  it('vacía elimina y no escribe en el plan ni las selecciones', async () => {
    sesionDe(RESIDENTE)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await guardarNotaDieta({ nota: '   ' })).toEqual({ ok: true, data: null })
    expect(falso.rpcs[0].args).toEqual({ p_usuario: RESIDENTE.id, p_nota: null })
    expect(falso.operaciones).toEqual([])
  })

  it('el Director puede gestionar la nota de otra persona', async () => {
    sesionDe(DIRECTOR)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await guardarNotaDieta({ nota: 'Indicaciones generales', usuarioId: OTRA })).toEqual({ ok: true, data: null })
    expect(falso.rpcs[0].args).toEqual({ p_usuario: OTRA, p_nota: 'Indicaciones generales' })
  })

  it.each([ADMINISTRACION, RESIDENTE])('rechaza gestión ajena de $rol antes de consultar la base', async (perfil) => {
    sesionDe(perfil)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await guardarNotaDieta({ nota: 'Indicaciones generales', usuarioId: OTRA })).toEqual(SIN_PERMISO)
    expect(falso.rpcs).toEqual([])
  })

  it('rechaza una nota demasiado larga y conserva el error de permiso de la base', async () => {
    sesionDe(DIRECTOR)
    const falso = usarCliente(clienteSupabaseFalso({ rpc: [{ data: null, error: { code: '42501' } }] }))
    expect((await guardarNotaDieta({ nota: 'x'.repeat(1001) })).ok).toBe(false)
    expect(falso.rpcs).toEqual([])
    expect(await guardarNotaDieta({ nota: 'Indicaciones', usuarioId: OTRA })).toEqual(SIN_PERMISO)
  })
})

describe('guardarSeleccion: siempre por guardar_seleccion_de, con el objetivo', () => {
  it('sin usuarioId, las propias', async () => {
    sesionDe(RESIDENTE)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await guardarSeleccion(SELECCION)).toEqual({ ok: true, data: null })
    expect(falso.rpcs).toEqual([
      {
        nombre: 'guardar_seleccion_de',
        args: { p_usuario: RESIDENTE.id, p_fecha: '2026-09-30', p_comida: 'almuerzo', p_estado: 'no', p_nota: null },
      },
    ])
    expect(revalidatePath).toHaveBeenCalledWith('/comidas', 'layout')
  })

  it('el Director, las de otra persona', async () => {
    sesionDe(DIRECTOR)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await guardarSeleccion({ ...SELECCION, estado: 'tarde', nota: '13:30', usuarioId: OTRA })).toEqual({ ok: true, data: null })
    expect(falso.rpcs[0].args).toMatchObject({ p_usuario: OTRA, p_estado: 'tarde', p_nota: '13:30' })
  })

  it('un Residente no llega a la base con las de otra persona', async () => {
    sesionDe(RESIDENTE)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await guardarSeleccion({ ...SELECCION, usuarioId: OTRA })).toMatchObject(SIN_PERMISO)
    expect(falso.rpcs).toEqual([])
  })

  it('Administración tampoco', async () => {
    sesionDe(ADMINISTRACION)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await guardarSeleccion(SELECCION)).toMatchObject(SIN_PERMISO)
    expect(falso.rpcs).toEqual([])
  })

  it('una nota que la base rechaza (MOL04) se explica en tercera persona si es de otra persona', async () => {
    sesionDe(DIRECTOR)
    usarCliente(clienteSupabaseFalso({ rpc: [{ data: null, error: { code: 'MOL04', message: 'Nota inválida' } }] }))
    expect(await guardarSeleccion({ ...SELECCION, estado: 'enfermo', nota: 'Sopa', usuarioId: OTRA })).toMatchObject({
      ok: false,
      error: 'Indicá qué puede comer (hasta 200 caracteres).',
    })
    usarCliente(clienteSupabaseFalso({ rpc: [{ data: null, error: { code: 'MOL04', message: 'Nota inválida' } }] }))
    expect(await guardarSeleccion({ ...SELECCION, estado: 'enfermo', nota: 'Sopa' })).toMatchObject({
      error: 'Indicá qué podés comer (hasta 200 caracteres).',
    })
  })

  it('si la base lo rechaza (persona inactiva o de Administración) avisa sin permiso', async () => {
    sesionDe(DIRECTOR)
    usarCliente(clienteSupabaseFalso({ rpc: [{ data: null, error: { code: '42501', message: 'Solo el Director…' } }] }))
    expect(await guardarSeleccion({ ...SELECCION, usuarioId: OTRA })).toMatchObject(SIN_PERMISO)
  })
})

describe('volverAPlan: siempre por volver_a_plan_de, con el objetivo', () => {
  it('sin usuarioId, las propias', async () => {
    sesionDe(DIRECTOR)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await volverAPlan({ fecha: '2026-09-30', comida: 'cena' })).toEqual({ ok: true, data: null })
    expect(falso.rpcs).toEqual([{ nombre: 'volver_a_plan_de', args: { p_usuario: DIRECTOR.id, p_fecha: '2026-09-30', p_comida: 'cena' } }])
  })

  it('el Director, las de otra persona; un Residente no', async () => {
    sesionDe(DIRECTOR)
    const falso = usarCliente(clienteSupabaseFalso())
    await volverAPlan({ fecha: '2026-09-30', comida: 'cena', usuarioId: OTRA })
    expect(falso.rpcs[0].args).toMatchObject({ p_usuario: OTRA })

    sesionDe(RESIDENTE)
    const otro = usarCliente(clienteSupabaseFalso())
    expect(await volverAPlan({ fecha: '2026-09-30', comida: 'cena', usuarioId: OTRA })).toMatchObject(SIN_PERMISO)
    expect(otro.rpcs).toEqual([])
  })
})

describe.each([
  ['guardarSeleccion', guardarSeleccion],
  ['volverAPlan', volverAPlan],
] as const)('%s: período validado en el servidor', (_nombre, accion) => {
  it.each([RESIDENTE, DIRECTOR])('permite cambios de $rol dentro del período y en el último día inclusive', async (perfil) => {
    sesionDe(perfil)
    const falso = usarCliente(clienteSupabaseFalso())
    for (const fecha of ['2026-10-20', '2026-12-16']) {
      expect(await accion({ ...SELECCION, fecha })).toEqual({ ok: true, data: null })
    }
    expect(falso.rpcs.map((rpc) => rpc.args)).toEqual([
      expect.objectContaining({ p_usuario: perfil.id, p_fecha: '2026-10-20' }),
      expect.objectContaining({ p_usuario: perfil.id, p_fecha: '2026-12-16' }),
    ])
  })

  it.each([RESIDENTE, DIRECTOR])('bloquea fechas pasadas y posteriores al límite para $rol antes de escribir', async (perfil) => {
    sesionDe(perfil)
    const falso = usarCliente(clienteSupabaseFalso())
    for (const fecha of ['2026-09-15', '2026-12-17', '2026-12-20']) {
      expect(await accion({ ...SELECCION, fecha })).toMatchObject({
        ok: false,
        error: 'Solo podés cambiar comidas desde hoy hasta dentro de tres meses.',
      })
    }
    expect(falso.rpcs).toEqual([])
    expect(falso.operaciones).toEqual([])
    expect(after).not.toHaveBeenCalled()
  })

  it('el Director puede gestionar otra persona hasta el último día, pero no después', async () => {
    sesionDe(DIRECTOR)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await accion({ ...SELECCION, fecha: '2026-12-16', usuarioId: OTRA })).toEqual({ ok: true, data: null })
    expect(await accion({ ...SELECCION, fecha: '2026-12-17', usuarioId: OTRA })).toMatchObject({ ok: false })
    expect(falso.rpcs).toHaveLength(1)
    expect(falso.rpcs[0].args).toMatchObject({ p_usuario: OTRA, p_fecha: '2026-12-16' })
  })

  it('mantiene los permisos también en las nuevas fechas futuras', async () => {
    const falso = usarCliente(clienteSupabaseFalso())
    sesionDe(RESIDENTE)
    expect(await accion({ ...SELECCION, fecha: '2026-12-16', usuarioId: OTRA })).toMatchObject(SIN_PERMISO)
    sesionDe(ADMINISTRACION)
    expect(await accion({ ...SELECCION, fecha: '2026-12-16' })).toMatchObject(SIN_PERMISO)
    expect(falso.rpcs).toEqual([])
  })

  it('calcula hoy con la fecha del servidor en la zona del proyecto', async () => {
    sesionDe(RESIDENTE)
    const falso = usarCliente(clienteSupabaseFalso())
    vi.setSystemTime(new Date('2026-10-16T05:59:59Z')) // 15/10, 23:59:59 en El Salvador.
    expect(await accion({ ...SELECCION, fecha: '2027-01-15' })).toEqual({ ok: true, data: null })
    expect(await accion({ ...SELECCION, fecha: '2027-01-16' })).toMatchObject({ ok: false })
    vi.setSystemTime(new Date('2026-10-16T06:00:00Z'))
    expect(await accion({ ...SELECCION, fecha: '2027-01-16' })).toEqual({ ok: true, data: null })
    expect(falso.rpcs).toHaveLength(2)
  })

  it.each([
    ['2026-10-31', '2027-01-31', '2027-02-01'],
    ['2026-01-31', '2026-04-30', '2026-05-01'],
    ['2026-11-30', '2027-02-28', '2027-03-01'],
    ['2027-11-30', '2028-02-29', '2028-03-01'],
  ])('desde %s permite el límite %s y bloquea %s', async (hoy, ultimo, posterior) => {
    vi.setSystemTime(new Date(`${hoy}T08:00:00-06:00`))
    sesionDe(RESIDENTE)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await accion({ ...SELECCION, fecha: ultimo })).toEqual({ ok: true, data: null })
    expect(await accion({ ...SELECCION, fecha: posterior })).toMatchObject({ ok: false })
    expect(falso.rpcs).toHaveLength(1)
  })

  it('sigue informando el cierre por hora que rechaza la base y revalida la vista', async () => {
    vi.setSystemTime(new Date('2026-09-16T10:00:00-06:00'))
    sesionDe(RESIDENTE)
    usarCliente(clienteSupabaseFalso({ rpc: [{ data: null, error: { code: 'MOL01' } }] }))
    expect(await accion({ ...SELECCION, fecha: '2026-09-16' })).toMatchObject({ ok: false, error: 'El almuerzo ya cerró a las 10:00.' })
    expect(revalidatePath).toHaveBeenCalledWith('/comidas', 'layout')
    expect(after).not.toHaveBeenCalled()
  })

  it('sigue informando una comida futura cerrada por la base antes de su hora límite', async () => {
    sesionDe(RESIDENTE)
    usarCliente(clienteSupabaseFalso({ rpc: [{ data: null, error: { code: 'MOL01' } }] }))
    expect(await accion({ ...SELECCION, fecha: '2026-12-16' })).toMatchObject({ ok: false, error: 'El almuerzo ya cerró.' })
    expect(after).not.toHaveBeenCalled()
  })
})

describe('guardarPlan: escribe la celda del objetivo', () => {
  const CELDA = { diaSemana: 3, comida: 'cena', estado: 'temprano', nota: '19:00' }

  it('el Director guarda la celda de otra persona (sin mandar usuarioId a la base)', async () => {
    sesionDe(DIRECTOR)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await guardarPlan({ ...CELDA, usuarioId: OTRA })).toEqual({ ok: true, data: null })
    expect(falso.operaciones).toEqual([
      {
        tabla: 'plan_semanal',
        operacion: 'upsert',
        valores: { usuario_id: OTRA, dia_semana: 3, comida: 'cena', estado: 'temprano', nota: '19:00' },
        opciones: { onConflict: 'usuario_id,dia_semana,comida' },
        filtros: [],
      },
    ])
  })

  it('"Sin definir" borra la celda del objetivo', async () => {
    sesionDe(DIRECTOR)
    const falso = usarCliente(clienteSupabaseFalso({ consultas: [{ data: [{ comida: 'cena' }], error: null }] }))
    expect(await guardarPlan({ ...CELDA, estado: null, usuarioId: OTRA })).toEqual({ ok: true, data: null })
    expect(falso.operaciones[0]).toMatchObject({
      operacion: 'delete',
      filtros: [
        ['usuario_id', OTRA],
        ['dia_semana', 3],
        ['comida', 'cena'],
      ],
    })
  })

  it('si el borrado no afecta ninguna fila (RLS: la persona ya no está activa), no dice que guardó', async () => {
    sesionDe(DIRECTOR)
    usarCliente(clienteSupabaseFalso({ consultas: [{ data: [], error: null }] }))
    expect(await guardarPlan({ ...CELDA, estado: null, usuarioId: OTRA })).toEqual({
      ok: false,
      error: 'No se pudo guardar el cambio. Volvé a cargar la página.',
      campos: undefined,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/comidas', 'layout')
  })

  it('sin usuarioId, la propia; un Residente no toca la de otra persona', async () => {
    sesionDe(RESIDENTE)
    const falso = usarCliente(clienteSupabaseFalso())
    await guardarPlan(CELDA)
    expect(falso.operaciones[0].valores).toMatchObject({ usuario_id: RESIDENTE.id })

    const otro = usarCliente(clienteSupabaseFalso())
    expect(await guardarPlan({ ...CELDA, usuarioId: OTRA })).toMatchObject(SIN_PERMISO)
    expect(otro.operaciones).toEqual([])
  })
})

describe('agregarExtra: solo el Director, desde hoy', () => {
  const EXTRA = { fecha: '2099-01-15', comida: 'cena', cantidad: '3', nota: '  Sin sal ' }

  it('inserta el extra a su nombre, con la nota recortada', async () => {
    sesionDe(DIRECTOR)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await agregarExtra(EXTRA)).toEqual({ ok: true, data: null })
    expect(falso.operaciones).toEqual([
      {
        tabla: 'extras_manuales',
        operacion: 'insert',
        valores: { fecha: '2099-01-15', tiempo_comida: 'cena', cantidad: 3, nota: 'Sin sal', creado_por: DIRECTOR.id },
        filtros: [],
      },
    ])
    expect(revalidatePath).toHaveBeenCalledWith('/comidas', 'layout')
  })

  it.each([RESIDENTE, ADMINISTRACION])('$rol no agrega extras', async (perfil) => {
    sesionDe(perfil)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await agregarExtra(EXTRA)).toMatchObject(SIN_PERMISO)
    expect(falso.operaciones).toEqual([])
  })

  it('un día que ya pasó no le sirve a la cocina', async () => {
    sesionDe(DIRECTOR)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await agregarExtra({ ...EXTRA, fecha: '2020-01-15' })).toMatchObject({
      ok: false,
      campos: { fecha: 'Ese día ya pasó.' },
    })
    expect(falso.operaciones).toEqual([])
  })

  it('datos inválidos: dice qué campo', async () => {
    sesionDe(DIRECTOR)
    usarCliente(clienteSupabaseFalso())
    expect(await agregarExtra({ ...EXTRA, cantidad: '0' })).toMatchObject({ ok: false, campos: { cantidad: expect.any(String) } })
  })

  it('si la base lo rechaza, un error general', async () => {
    sesionDe(DIRECTOR)
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    usarCliente(clienteSupabaseFalso({ consultas: [{ data: null, error: { code: '08006', message: 'conexión' } }] }))
    expect(await agregarExtra(EXTRA)).toMatchObject({ ok: false, error: 'No se pudo agregar el extra. Intentá de nuevo.' })
    consola.mockRestore()
  })
})

describe('quitarExtra', () => {
  const ID = '3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c'

  it('el Director lo quita por id', async () => {
    sesionDe(DIRECTOR)
    const falso = usarCliente(clienteSupabaseFalso({ consultas: [{ data: [{ id: ID }], error: null }] }))
    expect(await quitarExtra({ id: ID })).toEqual({ ok: true, data: null })
    expect(falso.operaciones[0]).toMatchObject({ tabla: 'extras_manuales', operacion: 'delete', filtros: [['id', ID]] })
    expect(revalidatePath).toHaveBeenCalledWith('/comidas', 'layout')
  })

  it('0 filas: ya no existe o esa comida ya cerró', async () => {
    sesionDe(DIRECTOR)
    usarCliente(clienteSupabaseFalso({ consultas: [{ data: [], error: null }] }))
    expect(await quitarExtra({ id: ID })).toMatchObject({ ok: false, error: 'Ese extra ya no existe o esa comida ya cerró.' })
  })

  it('un Residente no quita extras; un id inválido tampoco llega a la base', async () => {
    sesionDe(RESIDENTE)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await quitarExtra({ id: ID })).toMatchObject(SIN_PERMISO)
    sesionDe(DIRECTOR)
    expect(await quitarExtra({ id: 'x' })).toMatchObject({ ok: false, error: 'Extra inválido.' })
    expect(falso.operaciones).toEqual([])
  })
})

describe('avisos push: lo que el Director cambia de otra persona, y los extras para la cocina', () => {
  it('guardarSeleccion de otra persona avisa a esa persona qué quedó; la propia no avisa', async () => {
    sesionDe(DIRECTOR)
    usarCliente(clienteSupabaseFalso())
    await guardarSeleccion({ ...SELECCION, estado: 'tarde', nota: ' 13:30 ', usuarioId: OTRA })
    await correrAfter()
    expect(avisarCambioDelDirector).toHaveBeenCalledWith({
      tipo: 'comida',
      personaId: OTRA,
      actorId: DIRECTOR.id,
      fecha: '2026-09-30',
      comida: 'almuerzo',
      eleccion: { estado: 'tarde', nota: '13:30' },
    })

    vi.clearAllMocks()
    usarCliente(clienteSupabaseFalso())
    await guardarSeleccion({ ...SELECCION, usuarioId: DIRECTOR.id })
    await guardarSeleccion(SELECCION)
    expect(after).not.toHaveBeenCalled()
  })

  it('si la base lo rechaza, no avisa', async () => {
    sesionDe(DIRECTOR)
    usarCliente(clienteSupabaseFalso({ rpc: [{ data: null, error: { code: '42501', message: 'no' } }] }))
    await guardarSeleccion({ ...SELECCION, usuarioId: OTRA })
    expect(after).not.toHaveBeenCalled()
  })

  it('volverAPlan de otra persona avisa para que vea cómo quedó', async () => {
    sesionDe(DIRECTOR)
    usarCliente(clienteSupabaseFalso())
    await volverAPlan({ fecha: '2026-09-30', comida: 'cena', usuarioId: OTRA })
    await correrAfter()
    expect(avisarCambioDelDirector).toHaveBeenCalledWith({
      tipo: 'comida',
      personaId: OTRA,
      actorId: DIRECTOR.id,
      fecha: '2026-09-30',
      comida: 'cena',
      eleccion: 'volver',
    })
  })

  it('guardarPlan de otra persona avisa la celda (o que quedó sin definir)', async () => {
    sesionDe(DIRECTOR)
    usarCliente(clienteSupabaseFalso())
    await guardarPlan({ diaSemana: 2, comida: 'almuerzo', estado: 'bolsa', nota: null, usuarioId: OTRA })
    usarCliente(clienteSupabaseFalso({ consultas: [{ data: [{ comida: 'cena' }], error: null }] }))
    await guardarPlan({ diaSemana: 6, comida: 'cena', estado: null, nota: null, usuarioId: OTRA })
    await correrAfter()
    expect(vi.mocked(avisarCambioDelDirector).mock.calls.map(([c]) => c)).toEqual([
      { tipo: 'plan', personaId: OTRA, actorId: DIRECTOR.id, diaSemana: 2, comida: 'almuerzo', valor: { estado: 'bolsa', nota: null } },
      { tipo: 'plan', personaId: OTRA, actorId: DIRECTOR.id, diaSemana: 6, comida: 'cena', valor: null },
    ])
  })

  it('el plan propio no avisa', async () => {
    sesionDe(RESIDENTE)
    usarCliente(clienteSupabaseFalso())
    await guardarPlan({ diaSemana: 2, comida: 'almuerzo', estado: 'bolsa', nota: null })
    expect(after).not.toHaveBeenCalled()
  })

  it('agregar y quitar un extra avisa a la cocina con fecha, comida, cantidad y nota', async () => {
    const ID = '3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c'
    sesionDe(DIRECTOR)
    usarCliente(clienteSupabaseFalso())
    await agregarExtra({ fecha: '2099-01-15', comida: 'cena', cantidad: '3', nota: '  Sin sal ' })
    const falso = usarCliente(
      clienteSupabaseFalso({
        consultas: [{ data: [{ id: ID, fecha: '2099-01-16', tiempo_comida: 'almuerzo', cantidad: 2, nota: null }], error: null }],
      }),
    )
    await quitarExtra({ id: ID })
    await correrAfter()
    expect(falso.operaciones[0].columnas).toBe('id, fecha, tiempo_comida, cantidad, nota')
    expect(vi.mocked(avisarExtraCocina).mock.calls.map(([c]) => c)).toEqual([
      { actorId: DIRECTOR.id, fecha: '2099-01-15', comida: 'cena', cantidad: 3, nota: 'Sin sal', accion: 'agregado' },
      { actorId: DIRECTOR.id, fecha: '2099-01-16', comida: 'almuerzo', cantidad: 2, nota: null, accion: 'quitado' },
    ])
  })

  it('un extra que no se pudo agregar o quitar no avisa', async () => {
    sesionDe(DIRECTOR)
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    usarCliente(clienteSupabaseFalso({ consultas: [{ data: null, error: { code: '08006', message: 'conexión' } }] }))
    await agregarExtra({ fecha: '2099-01-15', comida: 'cena', cantidad: '3' })
    usarCliente(clienteSupabaseFalso({ consultas: [{ data: [], error: null }] }))
    await quitarExtra({ id: '3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c' })
    expect(after).not.toHaveBeenCalled()
    consola.mockRestore()
  })
})
