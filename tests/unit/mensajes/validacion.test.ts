import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { camposConError } from '@/lib/validacion/auth'
import {
  esquemaBorrado,
  esquemaEdicionPropia,
  esquemaModeracion,
  esquemaPaginaMensajes,
  esquemaPublicacion,
  esquemaReaccion,
  esquemaRespuesta,
} from '@/lib/validacion/mensajes'

describe('esquemaPublicacion', () => {
  const id = randomUUID()

  it('recorta espacios', () => {
    expect(esquemaPublicacion.parse({ id, texto: '  Hola casa \n' })).toEqual({ id, texto: 'Hola casa' })
  })

  it('rechaza vacío, solo espacios (incluidos saltos de línea y tabs) o ausente con un mensaje junto al campo', () => {
    // Igual que el check de la tabla (texto ~ '\S'): lo que la base rechaza no pasa la validación.
    for (const texto of ['', '   ', '\n', '\t\t', ' \r\n\t ', null]) {
      const r = esquemaPublicacion.safeParse({ id, texto })
      expect(r.success).toBe(false)
      expect(camposConError(r.error!)).toEqual({ texto: 'Escribí un mensaje.' })
    }
  })

  it('acepta 2000 caracteres y rechaza 2001', () => {
    expect(esquemaPublicacion.safeParse({ id, texto: 'a'.repeat(2000) }).success).toBe(true)
    const r = esquemaPublicacion.safeParse({ id, texto: 'a'.repeat(2001) })
    expect(camposConError(r.error!)).toEqual({ texto: 'El mensaje no puede tener más de 2000 caracteres.' })
  })

  it('exige el id generado en el navegador (UUID)', () => {
    for (const malo of [null, '', 'no-es-uuid', 42]) {
      const r = esquemaPublicacion.safeParse({ id: malo, texto: 'Hola' })
      expect(camposConError(r.error!)).toEqual({ id: 'Mensaje inválido.' })
    }
  })
})

describe('esquemaRespuesta', () => {
  it('exige el id de la respuesta y el de la publicación', () => {
    const id = randomUUID()
    const padreId = randomUUID()
    expect(esquemaRespuesta.parse({ id, padreId, texto: ' Gracias ' })).toEqual({ id, padreId, texto: 'Gracias' })
    const r = esquemaRespuesta.safeParse({ id, padreId: 'no-es-uuid', texto: 'Gracias' })
    expect(camposConError(r.error!)).toEqual({ padreId: 'Mensaje inválido.' })
    const sinId = esquemaRespuesta.safeParse({ padreId, texto: 'Gracias' })
    expect(camposConError(sinId.error!)).toEqual({ id: 'Mensaje inválido.' })
  })
})

describe('esquemas sin formulario', () => {
  it('reacción: id y estado final booleano', () => {
    const id = randomUUID()
    expect(esquemaReaccion.parse({ mensajeId: id, presente: false })).toEqual({ mensajeId: id, presente: false })
    expect(esquemaReaccion.safeParse({ mensajeId: id, presente: 'true' }).success).toBe(false)
  })

  it('borrado: id válido', () => {
    expect(esquemaBorrado.safeParse({ id: randomUUID() }).success).toBe(true)
    expect(esquemaBorrado.safeParse({ id: 42 }).success).toBe(false)
  })

  it('página: cursor opcional con microsegundos y zona', () => {
    expect(esquemaPaginaMensajes.parse({})).toEqual({ antesDe: null })
    expect(esquemaPaginaMensajes.parse({ antesDe: '2026-09-16T16:05:00.123456+00:00' })).toEqual({
      antesDe: '2026-09-16T16:05:00.123456+00:00',
    })
    expect(esquemaPaginaMensajes.safeParse({ antesDe: 'ayer' }).success).toBe(false)
  })
})

describe('esquemaModeracion', () => {
  const ID = '3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c'

  it('acepta aprobar sin texto ni motivo', () => {
    expect(esquemaModeracion.parse({ id: ID, estado: 'aprobado' })).toEqual({ id: ID, estado: 'aprobado' })
  })

  it('acepta rechazar con motivo', () => {
    expect(esquemaModeracion.parse({ id: ID, estado: 'rechazado', motivoRechazo: 'Muy largo' }).motivoRechazo).toBe(
      'Muy largo',
    )
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
  const ID = '3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c'

  it('acepta id y texto', () => {
    expect(esquemaEdicionPropia.parse({ id: ID, texto: 'Corregido' })).toEqual({ id: ID, texto: 'Corregido' })
  })

  it('rechaza texto vacío', () => {
    expect(esquemaEdicionPropia.safeParse({ id: ID, texto: '   ' }).success).toBe(false)
  })
})
