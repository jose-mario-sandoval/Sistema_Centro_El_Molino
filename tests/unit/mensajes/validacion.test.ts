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
