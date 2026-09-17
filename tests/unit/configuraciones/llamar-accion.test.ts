import { describe, expect, it } from 'vitest'
import {
  accionDeFormulario,
  llamarAccion,
  MENSAJE_SIN_CONEXION,
} from '@/app/(app)/configuraciones/_componentes/llamar-accion'
import { exito, fallo } from '@/lib/acciones/resultado'

describe('llamarAccion', () => {
  it('devuelve el resultado de la acción tal cual', async () => {
    expect(await llamarAccion(async () => exito({ id: 'x' }))).toEqual({ ok: true, data: { id: 'x' } })
    expect(await llamarAccion(async () => fallo('Revisá los datos.', { correo: 'Mal' }))).toEqual({
      ok: false,
      error: 'Revisá los datos.',
      campos: { correo: 'Mal' },
    })
  })

  it('convierte un rechazo (sin red o acción no encontrada) en un fallo sin campos', async () => {
    const resultado = await llamarAccion(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(resultado).toEqual({ ok: false, error: MENSAJE_SIN_CONEXION, campos: undefined })
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
    expect(await rota(null, datos)).toEqual({ ok: false, error: MENSAJE_SIN_CONEXION, campos: undefined })
  })
})
