import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  avisarCambioComidaCocina,
  avisarCambioDelDirector,
  avisarCambioPlanCocina,
  avisarExtraCocina,
  avisarPedidoCocina,
  avisarSerieCocina,
} from '@/lib/push/avisos-casa'
import { enviarAUsuarios } from '@/lib/push/enviar'
import { crearClienteAdmin } from '@/lib/supabase/admin'

// Sin red ni base: el cliente admin es un falso en memoria por tabla y el envío se espía.
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ crearClienteAdmin: vi.fn() }))
vi.mock('@/lib/push/enviar', () => ({ enviarAUsuarios: vi.fn() }))

type Fila = Record<string, unknown>

const AVISOS = { activo: true, avisar_mensajes: true, avisar_hora_limite: true, avisar_cambios: true, avisar_cocina: true }
const PERFILES: Fila[] = [
  { id: 'dir', nombre: 'Directora Prueba', siglas: 'DP', rol: 'director', ...AVISOS },
  { id: 'r1', nombre: 'Juan Pérez', siglas: 'JP', rol: 'residente', ...AVISOS },
  { id: 'r2', nombre: 'Ana Torres', siglas: 'AT', rol: 'residente', ...AVISOS, avisar_cambios: false },
  { id: 'adm', nombre: 'Administración Prueba', siglas: 'AP', rol: 'administracion', ...AVISOS },
  { id: 'adm2', nombre: 'Cocina Dos', siglas: 'C2', rol: 'administracion', ...AVISOS, avisar_cocina: false },
]
const HORAS: Fila[] = [
  { comida: 'desayuno', dia_relativo: -1, hora: '21:00:00' },
  { comida: 'almuerzo', dia_relativo: 0, hora: '10:00:00' },
  { comida: 'cena', dia_relativo: 0, hora: '16:00:00' },
]

/** Tablas en memoria con filtros eq/lte/gte: `maybeSingle()` da la primera fila; `await`, todas. */
function usarTablas(tablas: Record<string, Fila[]>) {
  const cliente = {
    from(tabla: string) {
      const filtros: ((f: Fila) => boolean)[] = []
      const filas = () => (tablas[tabla] ?? []).filter((f) => filtros.every((cumple) => cumple(f)))
      const q = {
        select: () => q,
        // 'eventos.fecha' filtra por la fila embebida, como PostgREST con !inner.
        eq: (c: string, v: unknown) => (filtros.push((f) => c.split('.').reduce<unknown>((x, k) => (x as Fila)?.[k], f) === v), q),
        lte: (c: string, v: string) => (filtros.push((f) => String(f[c]) <= v), q),
        gte: (c: string, v: string) => (filtros.push((f) => String(f[c]) >= v), q),
        maybeSingle: () => Promise.resolve({ data: filas()[0] ?? null, error: null }),
        then: (resolver: (r: { data: Fila[]; error: null }) => unknown, rechazar?: (e: unknown) => unknown) =>
          Promise.resolve({ data: filas(), error: null }).then(resolver, rechazar),
      }
      return q
    },
  }
  vi.mocked(crearClienteAdmin).mockReturnValue(cliente as unknown as ReturnType<typeof crearClienteAdmin>)
}

function envios() {
  return vi.mocked(enviarAUsuarios).mock.calls.map(([ids, carga]) => ({ ids, carga }))
}

const NOMBRES = /Juan|Pérez|Ana|Torres|Directora|Administración Prueba|Cocina Dos|Cumpleaños|san_rafael/

beforeEach(() => {
  vi.mocked(enviarAUsuarios).mockReset().mockResolvedValue({ enviadas: 1, caducadas: 0, fallidas: 0, descartadas: 0 })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // Martes 29/9/2026, 11:00 en la casa.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-29T11:00:00-06:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('avisarCambioDelDirector', () => {
  it('una comida que eligió el Director: a la persona, con cómo quedó', async () => {
    usarTablas({ perfiles: PERFILES })
    await avisarCambioDelDirector({
      tipo: 'comida',
      personaId: 'r1',
      actorId: 'dir',
      fecha: '2026-09-30',
      comida: 'almuerzo',
      eleccion: { estado: 'temprano', nota: '12:00' },
    })
    expect(envios()).toEqual([
      {
        ids: ['r1'],
        carga: {
          titulo: 'El Director cambió tu almuerzo del miércoles 30/9',
          cuerpo: 'Ahora: Comer temprano 12:00.',
          url: '/comidas/semana?semana=2026-09-28',
          etiqueta: 'cambio-comida-r1',
        },
      },
    ])
  })

  it('volver al plan relee la ausencia y el plan para decir cómo quedó', async () => {
    const base = { tipo: 'comida' as const, personaId: 'r1', actorId: 'dir', fecha: '2026-09-30', comida: 'cena' as const, eleccion: 'volver' as const }
    usarTablas({ perfiles: PERFILES, ausencias: [{ usuario_id: 'r1', desde: '2026-09-30', hasta: '2026-10-02' }] })
    await avisarCambioDelDirector(base)
    usarTablas({ perfiles: PERFILES, plan_semanal: [{ usuario_id: 'r1', dia_semana: 3, comida: 'cena', estado: 'tarde', nota: '20:00' }] })
    await avisarCambioDelDirector(base)
    usarTablas({ perfiles: PERFILES })
    await avisarCambioDelDirector(base)
    expect(envios().map((e) => e.carga.cuerpo)).toEqual([
      'Volvió a tu ausencia: No comer.',
      'Volvió a tu plan: Comer tarde 20:00.',
      'Volvió a tu plan, que no dice nada para esa comida: quedó sin definir.',
    ])
  })

  it('el plan y las ausencias', async () => {
    usarTablas({ perfiles: PERFILES })
    await avisarCambioDelDirector({ tipo: 'plan', personaId: 'r1', actorId: 'dir', diaSemana: 2, comida: 'almuerzo', valor: null })
    await avisarCambioDelDirector({ tipo: 'ausencia', personaId: 'r1', actorId: 'dir', desde: '2026-10-05', hasta: '2026-10-09', accion: 'marcada' })
    expect(envios().map((e) => e.carga.titulo)).toEqual([
      'El Director cambió tu plan de los martes',
      'El Director marcó una ausencia del 5 al 9 de octubre',
    ])
  })

  it('nunca a quien hizo el cambio, ni a quien apagó el aviso', async () => {
    usarTablas({ perfiles: PERFILES })
    await avisarCambioDelDirector({ tipo: 'plan', personaId: 'dir', actorId: 'dir', diaSemana: 2, comida: 'almuerzo', valor: null })
    await avisarCambioDelDirector({ tipo: 'plan', personaId: 'r2', actorId: 'dir', diaSemana: 2, comida: 'almuerzo', valor: null })
    expect(enviarAUsuarios).not.toHaveBeenCalled()
  })

  it('nunca lanza', async () => {
    vi.mocked(crearClienteAdmin).mockImplementation(() => {
      throw new Error('caída')
    })
    await expect(
      avisarCambioDelDirector({ tipo: 'plan', personaId: 'r1', actorId: 'dir', diaSemana: 2, comida: 'almuerzo', valor: null }),
    ).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})

describe('avisarExtraCocina', () => {
  it('a Administración (con el aviso activado), con el total de extras de esa comida, como lo ve en su Semana', async () => {
    usarTablas({
      perfiles: PERFILES,
      horas_limite: HORAS,
      extras_manuales: [
        { fecha: '2026-10-01', tiempo_comida: 'almuerzo', cantidad: 2 },
        { fecha: '2026-10-01', tiempo_comida: 'almuerzo', cantidad: 1 },
        { fecha: '2026-10-01', tiempo_comida: 'cena', cantidad: 4 },
      ],
      // Los confirmados por el enlace público también suman (extras_de_la_semana), sin nombres.
      enlaces_confirmacion: [
        { tiempo_comida: 'almuerzo', eventos: { fecha: '2026-10-01' }, confirmaciones_extra: [{ cantidad_personas: 2 }] },
        { tiempo_comida: 'cena', eventos: { fecha: '2026-10-01' }, confirmaciones_extra: [{ cantidad_personas: 5 }] },
        { tiempo_comida: 'almuerzo', eventos: { fecha: '2026-10-02' }, confirmaciones_extra: [{ cantidad_personas: 7 }] },
      ],
    })
    await avisarExtraCocina({ actorId: 'dir', fecha: '2026-10-01', comida: 'almuerzo', cantidad: 3, nota: 'sin sal', accion: 'agregado' })
    expect(envios()).toEqual([
      {
        ids: ['adm'],
        carga: {
          titulo: 'Extra para la cocina',
          cuerpo: 'Almuerzo del jueves 1/10: 3 personas más (sin sal). Total de extras: 5 personas.',
          url: '/comidas/semana?semana=2026-09-28',
          etiqueta: 'cocina-extras-2026-10-01-almuerzo',
        },
      },
    ])
  })

  it('después de la hora límite (o el mismo día) es de último momento', async () => {
    usarTablas({ perfiles: PERFILES, horas_limite: HORAS, extras_manuales: [{ fecha: '2026-09-29', tiempo_comida: 'almuerzo', cantidad: 1 }] })
    await avisarExtraCocina({ actorId: 'dir', fecha: '2026-09-29', comida: 'almuerzo', cantidad: 1, nota: null, accion: 'agregado' })
    expect(envios()[0].carga).toMatchObject({ titulo: 'Extra de último momento', renotificar: true })
  })

  it('un día que ya pasó no se avisa', async () => {
    usarTablas({ perfiles: PERFILES, horas_limite: HORAS })
    await avisarExtraCocina({ actorId: 'dir', fecha: '2026-09-28', comida: 'cena', cantidad: 1, nota: null, accion: 'agregado' })
    expect(enviarAUsuarios).not.toHaveBeenCalled()
  })
})

describe('avisarCambioComidaCocina', () => {
  const HOY_ALMUERZO = { personaId: 'r1', actorId: 'r1', fecha: '2026-09-29', comida: 'cena' as const }

  it('a Administración (con el aviso activado): quién por sus siglas y cómo quedó, sin nombres', async () => {
    usarTablas({ perfiles: PERFILES })
    await avisarCambioComidaCocina({ ...HOY_ALMUERZO, eleccion: { estado: 'tarde', nota: '19:30' } })
    expect(envios()).toEqual([
      {
        ids: ['adm'],
        carga: {
          titulo: 'Cambio de último momento · Cena de hoy',
          cuerpo: 'JP: Comer tarde 19:30.',
          url: '/comidas/semana?semana=2026-09-28',
          etiqueta: 'cocina-comida-2026-09-29-cena-JP',
          renotificar: true,
        },
      },
    ])
    expect(JSON.stringify(envios())).not.toMatch(NOMBRES)
  })

  it('el Director que cambia la comida de otra persona también avisa a la cocina, con las siglas de esa persona', async () => {
    usarTablas({ perfiles: PERFILES })
    await avisarCambioComidaCocina({ ...HOY_ALMUERZO, actorId: 'dir', eleccion: { estado: 'no', nota: null } })
    expect(envios().map((e) => ({ ids: e.ids, cuerpo: e.carga.cuerpo }))).toEqual([{ ids: ['adm'], cuerpo: 'JP: No comer.' }])
  })

  it('nunca a residentes ni Directores, ni a la cuenta de cocina que apagó "Cambios para la cocina"', async () => {
    usarTablas({ perfiles: PERFILES })
    await avisarCambioComidaCocina({ ...HOY_ALMUERZO, eleccion: { estado: 'si', nota: null } })
    const todos = envios().flatMap((e) => e.ids)
    expect(todos).toEqual(['adm'])
    expect(todos).not.toContain('adm2')
    for (const otro of ['dir', 'r1', 'r2']) expect(todos).not.toContain(otro)
  })

  it('sin nadie en cocina que quiera el aviso, no envía nada', async () => {
    usarTablas({ perfiles: PERFILES.map((p) => (p.rol === 'administracion' ? { ...p, avisar_cocina: false } : p)) })
    await avisarCambioComidaCocina({ ...HOY_ALMUERZO, eleccion: { estado: 'si', nota: null } })
    expect(enviarAUsuarios).not.toHaveBeenCalled()
  })

  it('"Volver a su plan" dice cómo quedó la comida, sin decir si fue por el plan o por una ausencia', async () => {
    const volver = { ...HOY_ALMUERZO, eleccion: 'volver' as const }
    usarTablas({ perfiles: PERFILES, plan_semanal: [{ usuario_id: 'r1', dia_semana: 2, comida: 'cena', estado: 'lonchera', nota: null }] })
    await avisarCambioComidaCocina(volver)
    usarTablas({ perfiles: PERFILES, ausencias: [{ usuario_id: 'r1', desde: '2026-09-28', hasta: '2026-09-30' }] })
    await avisarCambioComidaCocina(volver)
    usarTablas({ perfiles: PERFILES })
    await avisarCambioComidaCocina(volver)
    expect(envios().map((e) => e.carga.cuerpo)).toEqual(['JP: Lonchera.', 'JP: No comer.', 'JP: sin definir.'])
    expect(JSON.stringify(envios())).not.toMatch(/ausencia|plan/i)
  })

  it('una persona que ya no existe no rompe nada', async () => {
    usarTablas({ perfiles: PERFILES })
    await avisarCambioComidaCocina({ ...HOY_ALMUERZO, personaId: 'nadie', eleccion: { estado: 'si', nota: null } })
    expect(enviarAUsuarios).not.toHaveBeenCalled()
  })

  it('nunca lanza', async () => {
    vi.mocked(crearClienteAdmin).mockImplementation(() => {
      throw new Error('caída')
    })
    await expect(avisarCambioComidaCocina({ ...HOY_ALMUERZO, eleccion: { estado: 'si', nota: null } })).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})

describe('avisarCambioPlanCocina', () => {
  // Martes 29/9/2026 a las 11:00 (el almuerzo cerró a las 10:00; la cena cierra a las 16:00).
  const CENA_DEL_MARTES = { personaId: 'r1', actorId: 'r1', diaSemana: 2, comida: 'cena' as const, valor: { estado: 'bolsa' as const, nota: null } }

  it('cambiar la celda de hoy, si la comida sigue abierta y nada manda sobre el plan, avisa a la cocina', async () => {
    usarTablas({ perfiles: PERFILES, horas_limite: HORAS })
    await avisarCambioPlanCocina(CENA_DEL_MARTES)
    expect(envios().map((e) => ({ ids: e.ids, titulo: e.carga.titulo, cuerpo: e.carga.cuerpo }))).toEqual([
      { ids: ['adm'], titulo: 'Cambio de último momento · Cena de hoy', cuerpo: 'JP: En bolsa.' },
    ])
  })

  it('dejar la celda sin definir también se avisa', async () => {
    usarTablas({ perfiles: PERFILES, horas_limite: HORAS })
    await avisarCambioPlanCocina({ ...CENA_DEL_MARTES, valor: null as never })
    expect(envios().map((e) => e.carga.cuerpo)).toEqual(['JP: sin definir.'])
  })

  it('otro día de la semana no cambia nada de hoy y ni siquiera consulta', async () => {
    usarTablas({ perfiles: PERFILES, horas_limite: HORAS })
    await avisarCambioPlanCocina({ ...CENA_DEL_MARTES, diaSemana: 3 })
    expect(enviarAUsuarios).not.toHaveBeenCalled()
    expect(crearClienteAdmin).not.toHaveBeenCalled()
  })

  it('una comida que ya cerró quedó congelada: el plan solo rige desde la próxima semana', async () => {
    usarTablas({ perfiles: PERFILES, horas_limite: HORAS })
    await avisarCambioPlanCocina({ ...CENA_DEL_MARTES, comida: 'almuerzo' })
    expect(enviarAUsuarios).not.toHaveBeenCalled()
  })

  it('un cambio puntual de esa comida o una ausencia mandan sobre el plan: la comida de hoy no cambió', async () => {
    usarTablas({ perfiles: PERFILES, horas_limite: HORAS, selecciones_comida: [{ usuario_id: 'r1', fecha: '2026-09-29', comida: 'cena' }] })
    await avisarCambioPlanCocina(CENA_DEL_MARTES)
    usarTablas({ perfiles: PERFILES, horas_limite: HORAS, ausencias: [{ usuario_id: 'r1', desde: '2026-09-28', hasta: '2026-09-30' }] })
    await avisarCambioPlanCocina(CENA_DEL_MARTES)
    expect(enviarAUsuarios).not.toHaveBeenCalled()
  })

  it('el cambio puntual de otra comida, de otro día o de otra persona no impide el aviso', async () => {
    usarTablas({
      perfiles: PERFILES,
      horas_limite: HORAS,
      selecciones_comida: [
        { usuario_id: 'r1', fecha: '2026-09-29', comida: 'almuerzo' },
        { usuario_id: 'r1', fecha: '2026-09-30', comida: 'cena' },
        { usuario_id: 'r2', fecha: '2026-09-29', comida: 'cena' },
      ],
      ausencias: [{ usuario_id: 'r1', desde: '2026-10-05', hasta: '2026-10-06' }],
    })
    await avisarCambioPlanCocina(CENA_DEL_MARTES)
    expect(envios().map((e) => e.carga.cuerpo)).toEqual(['JP: En bolsa.'])
  })

  it('nunca lanza', async () => {
    vi.mocked(crearClienteAdmin).mockImplementation(() => {
      throw new Error('caída')
    })
    await expect(avisarCambioPlanCocina(CENA_DEL_MARTES)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})

describe('avisarPedidoCocina', () => {
  const evento = {
    id: 'e1',
    titulo: 'Cumpleaños de Juan Pérez',
    tipo: 'san_rafael' as const,
    fecha: '2026-10-01',
    hora: '15:00:00',
    requiere_cocina: ['merienda' as const],
    requiere_otro_texto: null,
  }

  it('evento nuevo con pedido: a Administración, con su categoría y sin título ni nombres', async () => {
    usarTablas({ perfiles: PERFILES })
    await avisarPedidoCocina({ actorId: 'dir', eventoId: 'e1', antes: null, despues: evento })
    expect(envios()).toHaveLength(1)
    expect(envios()[0].ids).toEqual(['adm'])
    expect(envios()[0].carga).toMatchObject({
      titulo: 'Nuevo pedido para la cocina',
      cuerpo: 'Jueves 1/10, 15:00 · San Rafael: Merienda.',
    })
    expect(JSON.stringify(envios())).not.toMatch(NOMBRES)
  })

  it('un cambio que no toca a la cocina (el título o la categoría) no se avisa', async () => {
    usarTablas({ perfiles: PERFILES })
    const otroTitulo = { ...evento, titulo: 'Otro título', tipo: 'otro' as const }
    await avisarPedidoCocina({ actorId: 'dir', eventoId: 'e1', antes: evento, despues: otroTitulo })
    expect(enviarAUsuarios).not.toHaveBeenCalled()
  })
})

describe('avisarSerieCocina', () => {
  it('una serie: un solo aviso, solo con las fechas de hoy en adelante', async () => {
    usarTablas({ perfiles: PERFILES })
    const pedidos = ['2026-09-22', '2026-10-06', '2026-10-13', '2026-10-20'].map((fecha) => ({
      fecha,
      hora: null,
      tipo: 'san_miguel' as const,
      requiere_cocina: ['comida' as const],
      requiere_otro_texto: null,
      titulo: 'Retiro de los jueves',
    }))
    await avisarSerieCocina({ actorId: 'dir', serieId: 's1', accion: 'creada', pedidos })
    expect(envios()).toEqual([
      {
        ids: ['adm'],
        carga: {
          titulo: 'Se agregaron 3 eventos con pedido a cocina',
          cuerpo: 'Del 6 al 20 de octubre · San Miguel: Comida.',
          url: '/calendario?mes=2026-10',
          etiqueta: 'cocina-serie-s1',
        },
      },
    ])
    expect(JSON.stringify(envios())).not.toMatch(/Retiro|jueves/)
  })

  it('sin pedido a la cocina no se avisa', async () => {
    usarTablas({ perfiles: PERFILES })
    await avisarSerieCocina({
      actorId: 'dir',
      serieId: 's1',
      accion: 'cancelada',
      pedidos: [{ fecha: '2026-10-06', hora: null, tipo: 'otro', requiere_cocina: [], requiere_otro_texto: null }],
    })
    expect(enviarAUsuarios).not.toHaveBeenCalled()
  })
})

describe('leerPerfiles sin la migración de preferencias (20260929120000)', () => {
  it('los avisos de siempre siguen saliendo: las preferencias nuevas valen true', async () => {
    const { leerPerfiles } = await import('@/lib/push/avisos')
    const sinColumnas = PERFILES.map((p) => {
      const copia = { ...p }
      delete copia.avisar_cambios
      delete copia.avisar_cocina
      return copia
    })
    let intentos = 0
    const cliente = {
      from: () => ({
        select: (columnas: string) => {
          intentos++
          return Promise.resolve(
            columnas.includes('avisar_cambios')
              ? { data: null, error: { code: '42703', message: 'column perfiles.avisar_cambios does not exist' } }
              : { data: sinColumnas, error: null },
          )
        },
      }),
    }
    vi.mocked(crearClienteAdmin).mockReturnValue(cliente as unknown as ReturnType<typeof crearClienteAdmin>)
    const perfiles = await leerPerfiles()
    expect(intentos).toBe(2)
    expect(perfiles.every((p) => p.avisar_cambios && p.avisar_cocina)).toBe(true)
    expect(perfiles.find((p) => p.id === 'r1')).toMatchObject({ nombre: 'Juan Pérez', avisar_mensajes: true })
  })
})
