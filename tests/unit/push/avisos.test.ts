import { beforeEach, describe, expect, it, vi } from 'vitest'
import { avisarMensajePendiente, avisarModeracion, avisarNuevaPublicacion, avisarNuevaRespuesta } from '@/lib/push/avisos'
import { enviarAUsuarios } from '@/lib/push/enviar'
import { crearClienteAdmin } from '@/lib/supabase/admin'

// Sin red ni base: el cliente admin es un falso en memoria y el envío se espía.
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ crearClienteAdmin: vi.fn() }))
vi.mock('@/lib/push/enviar', () => ({ enviarAUsuarios: vi.fn() }))

type Mensaje = { id: string; autor_id: string; padre_id: string | null; texto: string; estado: string; motivo_rechazo?: string | null }

const AVISOS = { activo: true, avisar_mensajes: true, avisar_hora_limite: true, avisar_cambios: true, avisar_cocina: true }
const PERFILES = [
  { id: 'dir', nombre: 'Directora', siglas: 'DP', rol: 'director', ...AVISOS },
  { id: 'r1', nombre: 'Residente Uno', siglas: 'R1', rol: 'residente', ...AVISOS },
  { id: 'r2', nombre: 'Residente Dos', siglas: 'R2', rol: 'residente', ...AVISOS },
  { id: 'adm', nombre: 'Administración', siglas: 'AD', rol: 'administracion', ...AVISOS },
]

/** Lecturas por tabla con filtros `eq`: `maybeSingle()` da la primera fila; `await` da todas. */
function clienteFalso(mensajes: Mensaje[]) {
  return {
    from(tabla: string) {
      const filtros: [string, unknown][] = []
      const filas = () =>
        (tabla === 'mensajes' ? mensajes : PERFILES).filter((f) =>
          filtros.every(([col, val]) => (f as Record<string, unknown>)[col] === val),
        )
      let contar = false
      const q = {
        select: (_columnas?: string, opciones?: { count?: string; head?: boolean }) => {
          contar = Boolean(opciones?.count)
          return q
        },
        eq: (col: string, val: unknown) => {
          filtros.push([col, val])
          return q
        },
        maybeSingle: () => Promise.resolve({ data: filas()[0] ?? null, error: null }),
        then: (resolver: (r: { data: unknown; error: null; count?: number }) => unknown) =>
          Promise.resolve(contar ? { data: null, count: filas().length, error: null } : { data: filas(), error: null }).then(resolver),
      }
      return q
    },
  }
}

function con(mensajes: Mensaje[]) {
  vi.mocked(crearClienteAdmin).mockReturnValue(clienteFalso(mensajes) as unknown as ReturnType<typeof crearClienteAdmin>)
}

const RESUMEN = { enviadas: 1, caducadas: 0, fallidas: 0, descartadas: 0 }

beforeEach(() => {
  vi.mocked(enviarAUsuarios).mockReset().mockResolvedValue(RESUMEN)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('avisarNuevaPublicacion', () => {
  it('avisa una publicación aprobada', async () => {
    con([{ id: 'p', autor_id: 'dir', padre_id: null, texto: 'Aviso', estado: 'aprobado' }])
    await avisarNuevaPublicacion('p')
    const destinatarios = vi.mocked(enviarAUsuarios).mock.calls.flatMap(([ids]) => ids)
    expect(destinatarios.sort()).toEqual(['adm', 'r1', 'r2'])
  })

  it('no avisa (ni con el texto) una publicación pendiente o rechazada', async () => {
    for (const estado of ['pendiente', 'rechazado']) {
      con([{ id: 'p', autor_id: 'r1', padre_id: null, texto: 'Secreto', estado }])
      await avisarNuevaPublicacion('p')
    }
    expect(enviarAUsuarios).not.toHaveBeenCalled()
  })
})

describe('avisarNuevaRespuesta', () => {
  const publicacion = (estado: string): Mensaje => ({ id: 'p', autor_id: 'dir', padre_id: null, texto: 'Aviso', estado })
  const respuesta = (estado: string): Mensaje => ({ id: 'r', autor_id: 'r1', padre_id: 'p', texto: 'Respuesta', estado })

  it('avisa una respuesta aprobada bajo una publicación aprobada', async () => {
    con([publicacion('aprobado'), respuesta('aprobado')])
    await avisarNuevaRespuesta('r')
    const destinatarios = vi.mocked(enviarAUsuarios).mock.calls.flatMap(([ids]) => ids)
    expect(destinatarios).toEqual(['dir'])
  })

  it('no avisa una respuesta pendiente', async () => {
    con([publicacion('aprobado'), respuesta('pendiente')])
    await avisarNuevaRespuesta('r')
    expect(enviarAUsuarios).not.toHaveBeenCalled()
  })

  it('no avisa una respuesta aprobada si su publicación todavía no lo está', async () => {
    con([publicacion('pendiente'), respuesta('aprobado')])
    await avisarNuevaRespuesta('r')
    expect(enviarAUsuarios).not.toHaveBeenCalled()
  })
})

/** Destinatarios y carga de cada envío. */
function envios() {
  return vi.mocked(enviarAUsuarios).mock.calls.map(([ids, carga]) => ({ ids, carga }))
}

describe('avisarMensajePendiente', () => {
  it('avisa solo a los Directores, con el nombre del autor y cuántos esperan', async () => {
    con([
      { id: 'p', autor_id: 'r1', padre_id: null, texto: 'Hola', estado: 'pendiente' },
      { id: 'q', autor_id: 'r2', padre_id: null, texto: 'Otro', estado: 'pendiente' },
    ])
    await avisarMensajePendiente('p')
    expect(envios()).toEqual([
      {
        ids: ['dir'],
        carga: {
          titulo: '2 mensajes por aprobar',
          cuerpo: 'Residente Uno publicó un mensaje que espera tu aprobación.',
          url: '/mensajes?vista=pendientes',
          etiqueta: 'mensajes-por-aprobar',
        },
      },
    ])
  })

  it('una respuesta o una corrección lo dicen', async () => {
    con([{ id: 'r', autor_id: 'r1', padre_id: 'p', texto: 'Sí', estado: 'pendiente' }])
    await avisarMensajePendiente('r')
    con([{ id: 'p', autor_id: 'r1', padre_id: null, texto: 'Corregido', estado: 'pendiente' }])
    await avisarMensajePendiente('p', { correccion: true })
    expect(envios().map((e) => e.carga.cuerpo)).toEqual([
      'Residente Uno respondió en un hilo y la respuesta espera tu aprobación.',
      'Residente Uno corrigió su mensaje y espera tu aprobación.',
    ])
  })

  it('si ya no está pendiente (lo aprobaron entre tanto), no avisa', async () => {
    con([{ id: 'p', autor_id: 'r1', padre_id: null, texto: 'Hola', estado: 'aprobado' }])
    await avisarMensajePendiente('p')
    expect(enviarAUsuarios).not.toHaveBeenCalled()
  })

  it('nunca lanza: un error de la base queda en el log', async () => {
    vi.mocked(crearClienteAdmin).mockImplementation(() => {
      throw new Error('caída')
    })
    await expect(avisarMensajePendiente('p')).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})

describe('avisarModeracion', () => {
  it('aprobado: al autor, no a quien moderó', async () => {
    con([{ id: 'p', autor_id: 'r1', padre_id: null, texto: 'Hola', estado: 'aprobado' }])
    await avisarModeracion('p', 'dir', 'aprobado')
    expect(envios()).toEqual([
      {
        ids: ['r1'],
        carga: { titulo: 'Tu mensaje fue aprobado', cuerpo: 'Ya lo pueden leer todos en Mensajes.', url: '/mensajes', etiqueta: 'moderacion-p' },
      },
    ])
  })

  it('rechazado: con el motivo', async () => {
    con([{ id: 'r', autor_id: 'r1', padre_id: 'p', texto: 'Sí', estado: 'rechazado', motivo_rechazo: 'Repetido' }])
    await avisarModeracion('r', 'dir', 'rechazado')
    expect(envios()[0].carga).toMatchObject({
      titulo: 'Tu respuesta no fue aprobada',
      cuerpo: 'Motivo: Repetido. Podés corregirla y volver a enviarla desde Mensajes.',
    })
  })

  it('si el estado ya no es el que se moderó (lo corrigió y volvió a pendiente), no avisa', async () => {
    con([{ id: 'p', autor_id: 'r1', padre_id: null, texto: 'Hola', estado: 'pendiente' }])
    await avisarModeracion('p', 'dir', 'rechazado')
    expect(enviarAUsuarios).not.toHaveBeenCalled()
  })
})
