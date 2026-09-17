import { afterEach, describe, expect, it, vi } from 'vitest'
import { ERROR_CONEXION, llamarAccion } from '@/lib/acciones/llamar'
import { exito, fallo } from '@/lib/acciones/resultado'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('llamarAccion', () => {
  it('devuelve el resultado de la acción, sea éxito o fallo', async () => {
    expect(await llamarAccion(async () => exito({ id: 'a' }))).toEqual({ ok: true, data: { id: 'a' } })
    expect(await llamarAccion(async () => fallo('Revisá el mensaje.', { texto: 'Escribí un mensaje.' }))).toEqual({
      ok: false,
      error: 'Revisá el mensaje.',
      campos: { texto: 'Escribí un mensaje.' },
    })
  })

  it('convierte una promesa rechazada (sin red, acción desconocida tras un despliegue) en un fallo', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('Failed to find Server Action "abc"')
    const resultado = await llamarAccion<{ id: string }>(() => Promise.reject(error))
    expect(resultado).toEqual({ ok: false, error: ERROR_CONEXION, campos: undefined })
    expect(consola).toHaveBeenCalledWith(error)
  })

  it('también atrapa un error lanzado antes de devolver la promesa', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const resultado = await llamarAccion<null>(() => {
      throw new TypeError('Failed to fetch')
    })
    expect(resultado.ok).toBe(false)
  })
})
