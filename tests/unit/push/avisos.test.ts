import { beforeEach, describe, expect, it, vi } from 'vitest'
import { avisarNuevaPublicacion, avisarNuevaRespuesta } from '@/lib/push/avisos'
import { enviarAUsuarios } from '@/lib/push/enviar'
import { crearClienteAdmin } from '@/lib/supabase/admin'

// Sin red ni base: el cliente admin es un falso en memoria y el envío se espía.
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ crearClienteAdmin: vi.fn() }))
vi.mock('@/lib/push/enviar', () => ({ enviarAUsuarios: vi.fn() }))

type Mensaje = { id: string; autor_id: string; padre_id: string | null; texto: string; estado: string }

const PERFILES = [
  { id: 'dir', nombre: 'Directora', siglas: 'DP', rol: 'director', activo: true, avisar_mensajes: true, avisar_hora_limite: true },
  { id: 'r1', nombre: 'Residente Uno', siglas: 'R1', rol: 'residente', activo: true, avisar_mensajes: true, avisar_hora_limite: true },
  { id: 'r2', nombre: 'Residente Dos', siglas: 'R2', rol: 'residente', activo: true, avisar_mensajes: true, avisar_hora_limite: true },
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
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          filtros.push([col, val])
          return q
        },
        maybeSingle: () => Promise.resolve({ data: filas()[0] ?? null, error: null }),
        then: (resolver: (r: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({ data: filas(), error: null }).then(resolver),
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
    expect(destinatarios.sort()).toEqual(['r1', 'r2'])
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
