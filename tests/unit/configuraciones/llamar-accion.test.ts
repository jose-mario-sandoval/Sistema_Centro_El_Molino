import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import {
  accionDeFormulario,
  llamarAccion,
  MENSAJE_ACCION_FALLIDA,
} from '@/app/(app)/configuraciones/_componentes/llamar-accion'
import { exito, fallo } from '@/lib/acciones/resultado'

let errorConsola: MockInstance<typeof console.error>

beforeEach(() => {
  errorConsola = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorConsola.mockRestore()
})

describe('llamarAccion', () => {
  it('devuelve el resultado de la acción tal cual', async () => {
    expect(await llamarAccion(async () => exito({ id: 'x' }))).toEqual({ ok: true, data: { id: 'x' } })
    expect(await llamarAccion(async () => fallo('Revisá los datos.', { correo: 'Mal' }))).toEqual({
      ok: false,
      error: 'Revisá los datos.',
      campos: { correo: 'Mal' },
    })
    expect(errorConsola).not.toHaveBeenCalled()
  })

  it('convierte un rechazo (sin red, acción no encontrada o error del servidor) en un fallo y lo registra', async () => {
    const rechazo = new TypeError('Failed to fetch')
    const resultado = await llamarAccion(async () => {
      throw rechazo
    })
    expect(resultado).toEqual({ ok: false, error: MENSAJE_ACCION_FALLIDA, campos: undefined })
    expect(MENSAJE_ACCION_FALLIDA).toBe('No se pudo completar la acción. Revisá tu conexión o recargá la página.')
    expect(errorConsola).toHaveBeenCalledWith(expect.any(String), rechazo)
  })
})

describe('accionDeFormulario', () => {
  it('pasa el estado previo y los datos, y atrapa el rechazo', async () => {
    const datos = new FormData()
    datos.set('nombre', 'Ana')
    const eco = accionDeFormulario<string>(async (_previo, formData) => exito(String(formData.get('nombre'))))
    expect(await eco(null, datos)).toEqual({ ok: true, data: 'Ana' })

    const rota = accionDeFormulario<null>(async () => {
      throw new Error('Failed to find Server Action "abc"')
    })
    expect(await rota(null, datos)).toEqual({ ok: false, error: MENSAJE_ACCION_FALLIDA, campos: undefined })
  })
})
