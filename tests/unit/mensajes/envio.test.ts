import { describe, expect, it } from 'vitest'
import { confirmarEnvio, prepararEnvio, type EnvioPendiente } from '@/lib/mensajes/envio'

function generador() {
  let n = 0
  return () => `id-${++n}`
}

describe('prepararEnvio', () => {
  it('el primer envío lleva un id nuevo', () => {
    expect(prepararEnvio(null, 'Hola', generador())).toEqual({ id: 'id-1', texto: 'Hola' })
  })

  it('reintentar el mismo texto (sin confirmar) reusa el id', () => {
    const nuevoId = generador()
    const primero = prepararEnvio(null, 'Hola casa', nuevoId)
    expect(prepararEnvio(primero, 'Hola casa', nuevoId)).toBe(primero)
    // El servidor recorta: los espacios de los bordes no lo hacen otro mensaje.
    expect(prepararEnvio(primero, '  Hola casa\n', nuevoId)).toBe(primero)
  })

  it('un texto distinto es otro mensaje y lleva otro id', () => {
    const nuevoId = generador()
    const primero = prepararEnvio(null, 'Hola casa', nuevoId)
    expect(prepararEnvio(primero, 'Hola a todos', nuevoId)).toEqual({ id: 'id-2', texto: 'Hola a todos' })
  })
})

describe('confirmarEnvio', () => {
  it('tras un envío correcto, el siguiente mensaje (aunque repita el texto) lleva un id nuevo', () => {
    const nuevoId = generador()
    const primero = prepararEnvio(null, 'Gracias', nuevoId)
    const confirmado = confirmarEnvio(primero, primero.id)
    expect(confirmado).toBeNull()
    expect(prepararEnvio(confirmado, 'Gracias', nuevoId)).toEqual({ id: 'id-2', texto: 'Gracias' })
  })

  it('la confirmación de un envío anterior no descarta el pendiente actual', () => {
    const actual: EnvioPendiente = { id: 'id-2', texto: 'Otro' }
    expect(confirmarEnvio(actual, 'id-1')).toBe(actual)
    expect(confirmarEnvio(null, 'id-1')).toBeNull()
  })
})
