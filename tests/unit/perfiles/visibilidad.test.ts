import { describe, expect, it } from 'vitest'
import { paraObservador, veSoloSiglas } from '@/lib/perfiles/visibilidad'

const ana = { id: '1', nombre: 'Ana Torres', siglas: 'AT', rol: 'residente' as const }

describe('veSoloSiglas', () => {
  it('Administración ve solo siglas', () => {
    expect(veSoloSiglas('administracion')).toBe(true)
  })

  it.each([['director'], ['residente']] as const)('%s conoce los nombres', (rol) => {
    expect(veSoloSiglas(rol)).toBe(false)
  })

  it.each([[null], [undefined]])('sin rol conocido (%s) se elige lo más privado', (rol) => {
    expect(veSoloSiglas(rol)).toBe(true)
  })
})

describe('paraObservador', () => {
  it('para Administración el nombre pasa a ser las siglas y el resto no cambia', () => {
    expect(paraObservador(ana, 'administracion')).toEqual({ id: '1', nombre: 'AT', siglas: 'AT', rol: 'residente' })
  })

  it('para Directores y Residentes deja el nombre', () => {
    expect(paraObservador(ana, 'director')).toEqual(ana)
    expect(paraObservador(ana, 'residente')).toEqual(ana)
  })

  it('sin rol conocido no filtra el nombre', () => {
    expect(paraObservador(ana, null).nombre).toBe('AT')
  })

  it('no modifica el objeto original', () => {
    paraObservador(ana, 'administracion')
    expect(ana.nombre).toBe('Ana Torres')
  })
})
