import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { camposConError } from '@/lib/validacion/auth'
import {
  esquemaBorrado,
  esquemaPaginaMensajes,
  esquemaPublicacion,
  esquemaReaccion,
  esquemaRespuesta,
} from '@/lib/validacion/mensajes'

describe('esquemaPublicacion', () => {
  it('recorta espacios', () => {
    expect(esquemaPublicacion.parse({ texto: '  Hola casa \n' })).toEqual({ texto: 'Hola casa' })
  })

  it('rechaza vacío, solo espacios (incluidos saltos de línea y tabs) o ausente con un mensaje junto al campo', () => {
    // Igual que el check de la tabla (texto ~ '\S'): lo que la base rechaza no pasa la validación.
    for (const texto of ['', '   ', '\n', '\t\t', ' \r\n\t ', null]) {
      const r = esquemaPublicacion.safeParse({ texto })
      expect(r.success).toBe(false)
      expect(camposConError(r.error!)).toEqual({ texto: 'Escribí un mensaje.' })
    }
  })

  it('acepta 2000 caracteres y rechaza 2001', () => {
    expect(esquemaPublicacion.safeParse({ texto: 'a'.repeat(2000) }).success).toBe(true)
    const r = esquemaPublicacion.safeParse({ texto: 'a'.repeat(2001) })
    expect(camposConError(r.error!)).toEqual({ texto: 'El mensaje no puede tener más de 2000 caracteres.' })
  })
})

describe('esquemaRespuesta', () => {
  it('exige el id de la publicación', () => {
    const id = randomUUID()
    expect(esquemaRespuesta.parse({ padreId: id, texto: ' Gracias ' })).toEqual({ padreId: id, texto: 'Gracias' })
    const r = esquemaRespuesta.safeParse({ padreId: 'no-es-uuid', texto: 'Gracias' })
    expect(camposConError(r.error!)).toEqual({ padreId: 'Mensaje inválido.' })
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
