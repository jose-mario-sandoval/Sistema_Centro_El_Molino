import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { camposConError } from '@/lib/validacion/auth'
import {
  esquemaConfirmarCena,
  esquemaCrearEnlace,
  esquemaEditarEvento,
  esquemaEliminarEvento,
  esquemaEvento,
  requerimientosValidos,
} from '@/lib/validacion/calendario'

const VALIDO = { titulo: 'Charla formativa', fecha: '2026-09-16', hora: '19:30', tipo: 'san_gabriel', requiere_cocina: [] }
const ID = '3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c'

function camposInvalidos(esquema: z.ZodType, entrada: unknown): string[] {
  const resultado = esquema.safeParse(entrada)
  return resultado.success ? [] : Object.keys(camposConError(resultado.error))
}

describe('esquemaEvento', () => {
  it('acepta título, fecha y hora, y recorta el título', () => {
    expect(esquemaEvento.parse({ ...VALIDO, titulo: '  Charla formativa  ' })).toEqual({
      ...VALIDO,
      requiere_otro_texto: null,
    })
  })

  it('una hora vacía queda como null', () => {
    expect(esquemaEvento.parse({ ...VALIDO, hora: '' })).toEqual({ ...VALIDO, hora: null, requiere_otro_texto: null })
  })

  it('acepta un título de exactamente 120 caracteres', () => {
    expect(camposInvalidos(esquemaEvento, { ...VALIDO, titulo: 'x'.repeat(120) })).toEqual([])
  })

  it('acepta las fechas límite del rango', () => {
    expect(camposInvalidos(esquemaEvento, { ...VALIDO, fecha: '2000-01-01' })).toEqual([])
    expect(camposInvalidos(esquemaEvento, { ...VALIDO, fecha: '2099-12-31' })).toEqual([])
  })

  it.each(['1999-12-31', '2100-01-01', '0001-01-01', '9999-12-31'])('rechaza la fecha fuera de rango %s', (fecha) => {
    const resultado = esquemaEvento.safeParse({ ...VALIDO, fecha })
    expect(resultado.success).toBe(false)
    expect(camposConError(resultado.error!)).toEqual({ fecha: 'Fecha fuera de rango.' })
  })

  it('ignora campos desconocidos', () => {
    expect(esquemaEvento.parse({ ...VALIDO, id: ID, creado_por: ID })).toEqual({
      ...VALIDO,
      requiere_otro_texto: null,
    })
  })

  it.each([
    ['título vacío tras recortar', { titulo: '   ' }, 'titulo'],
    ['título de 121 caracteres', { titulo: 'x'.repeat(121) }, 'titulo'],
    ['título ausente', { titulo: null }, 'titulo'],
    ['fecha inexistente', { fecha: '2026-02-30' }, 'fecha'],
    ['fecha con otro formato', { fecha: '16/09/2026' }, 'fecha'],
    ['hora 24:00', { hora: '24:00' }, 'hora'],
    ['hora sin cero inicial', { hora: '7:30' }, 'hora'],
    ['hora con segundos', { hora: '19:30:00' }, 'hora'],
  ])('rechaza %s', (_caso, cambio, campo) => {
    expect(camposInvalidos(esquemaEvento, { ...VALIDO, ...cambio })).toEqual([campo])
  })
})

describe('esquemaEditarEvento', () => {
  it('acepta un id uuid junto con los campos', () => {
    expect(esquemaEditarEvento.parse({ ...VALIDO, hora: '', id: ID })).toEqual({
      ...VALIDO,
      hora: null,
      id: ID,
      requiere_otro_texto: null,
    })
  })

  it('rechaza un id que no es uuid', () => {
    expect(camposInvalidos(esquemaEditarEvento, { ...VALIDO, id: 'evento-1' })).toEqual(['id'])
  })
})

describe('esquemaEliminarEvento', () => {
  it('exige un id uuid', () => {
    expect(esquemaEliminarEvento.parse({ id: ID })).toEqual({ id: ID })
    expect(camposInvalidos(esquemaEliminarEvento, { id: 42 })).toEqual(['id'])
    expect(camposInvalidos(esquemaEliminarEvento, {})).toEqual(['id'])
  })
})

describe('esquemaEvento: tipo y pedidos a la cocina', () => {
  it.each(['san_rafael', 'san_gabriel', 'san_miguel', 'otro'])('acepta el tipo %s', (tipo) => {
    expect(camposInvalidos(esquemaEvento, { ...VALIDO, tipo })).toEqual([])
  })

  it.each([[undefined], [null], [''], ['fiesta']])('rechaza el tipo %j', (tipo) => {
    expect(camposInvalidos(esquemaEvento, { ...VALIDO, tipo })).toEqual(['tipo'])
  })

  it.each([[[]], [['merienda']], [['comida']], [['materiales']], [['merienda', 'comida']]])(
    'acepta pedir %j a la cocina',
    (requiere_cocina) => {
      expect(esquemaEvento.parse({ ...VALIDO, requiere_cocina }).requiere_cocina).toEqual(requiere_cocina)
    },
  )

  it.each([
    [['materiales', 'merienda']],
    [['comida', 'materiales']],
    [['merienda', 'merienda']],
    [['desayuno']],
    ['merienda'],
    [null],
  ])('rechaza pedir %j a la cocina', (requiere_cocina) => {
    expect(camposInvalidos(esquemaEvento, { ...VALIDO, requiere_cocina })).toEqual(['requiere_cocina'])
  })

  it('exige el campo: un formulario sin casillas manda una lista vacía, no nada', () => {
    const { requiere_cocina: _omitido, ...sinCocina } = VALIDO
    void _omitido
    expect(camposInvalidos(esquemaEvento, sinCocina)).toEqual(['requiere_cocina'])
  })
})

describe('esquemaEvento: pedido libre a Administración', () => {
  it('una cadena vacía queda como null', () => {
    expect(esquemaEvento.parse({ ...VALIDO, requiere_otro_texto: '' }).requiere_otro_texto).toBeNull()
  })

  it('recorta el texto', () => {
    expect(esquemaEvento.parse({ ...VALIDO, requiere_otro_texto: '  20 sillas  ' }).requiere_otro_texto).toBe('20 sillas')
  })

  it('acepta hasta 200 caracteres', () => {
    expect(camposInvalidos(esquemaEvento, { ...VALIDO, requiere_otro_texto: 'x'.repeat(200) })).toEqual([])
  })

  it('rechaza más de 200 caracteres', () => {
    expect(camposInvalidos(esquemaEvento, { ...VALIDO, requiere_otro_texto: 'x'.repeat(201) })).toEqual(['requiere_otro_texto'])
  })

  it('sin el campo, también queda null (el formulario puede no mandarlo)', () => {
    expect(esquemaEvento.parse(VALIDO).requiere_otro_texto).toBeNull()
  })
})

describe('requerimientosValidos', () => {
  it('"solo materiales" no se combina y no hay repetidos', () => {
    expect(requerimientosValidos([])).toBe(true)
    expect(requerimientosValidos(['materiales'])).toBe(true)
    expect(requerimientosValidos(['merienda', 'comida'])).toBe(true)
    expect(requerimientosValidos(['materiales', 'comida'])).toBe(false)
    expect(requerimientosValidos(['comida', 'comida'])).toBe(false)
  })
})

const ID_EVENTO = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b'

describe('esquemaCrearEnlace', () => {
  const VALIDO_ENLACE = { evento_id: ID_EVENTO, tiempo_comida: 'cena', fecha_vencimiento: '2026-10-10', hora_vencimiento: '15:00' }

  it('acepta datos válidos', () => {
    expect(camposInvalidos(esquemaCrearEnlace, VALIDO_ENLACE)).toEqual([])
  })

  it.each(['desayuno', 'almuerzo', 'cena'])('acepta el tiempo de comida %s', (tiempo_comida) => {
    expect(camposInvalidos(esquemaCrearEnlace, { ...VALIDO_ENLACE, tiempo_comida })).toEqual([])
  })

  it('rechaza un tiempo de comida inválido', () => {
    expect(camposInvalidos(esquemaCrearEnlace, { ...VALIDO_ENLACE, tiempo_comida: 'merienda' })).toEqual(['tiempo_comida'])
  })

  it('rechaza un evento_id que no es uuid', () => {
    expect(camposInvalidos(esquemaCrearEnlace, { ...VALIDO_ENLACE, evento_id: 'no-uuid' })).toEqual(['evento_id'])
  })

  it.each(['15:5', '3pm', ''])('rechaza la hora %j', (hora_vencimiento) => {
    expect(camposInvalidos(esquemaCrearEnlace, { ...VALIDO_ENLACE, hora_vencimiento })).toEqual(['hora_vencimiento'])
  })
})

describe('esquemaConfirmarCena', () => {
  const VALIDO_CONFIRMACION = { token: 'abc123', nombre: 'Familia Pérez', cantidad_personas: '3' }

  it('acepta datos válidos y convierte la cantidad a número', () => {
    expect(esquemaConfirmarCena.parse(VALIDO_CONFIRMACION).cantidad_personas).toBe(3)
  })

  it('recorta el nombre', () => {
    expect(esquemaConfirmarCena.parse({ ...VALIDO_CONFIRMACION, nombre: '  Familia Pérez  ' }).nombre).toBe('Familia Pérez')
  })

  it.each(['0', '11', 'x', ''])('rechaza la cantidad %j', (cantidad_personas) => {
    expect(camposInvalidos(esquemaConfirmarCena, { ...VALIDO_CONFIRMACION, cantidad_personas })).toEqual(['cantidad_personas'])
  })

  it('rechaza un nombre vacío', () => {
    expect(camposInvalidos(esquemaConfirmarCena, { ...VALIDO_CONFIRMACION, nombre: '   ' })).toEqual(['nombre'])
  })
})
