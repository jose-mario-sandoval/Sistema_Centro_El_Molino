import { describe, expect, it } from 'vitest'
import {
  nombreAdministracion,
  numeroDeAdministracion,
  siglasAdministracion,
  siguienteNumeroAdministracion,
  usuarioSugeridoAdministracion,
} from '@/lib/cuentas/administracion'

describe('nombre genérico de Administración', () => {
  it('nombre, siglas y usuario sugerido salen del mismo número', () => {
    expect(nombreAdministracion(3)).toBe('Administración 3')
    expect(siglasAdministracion(3)).toBe('A3')
    expect(usuarioSugeridoAdministracion(3)).toBe('admin.3')
  })

  it('reconoce el número de un nombre genérico, y nada más', () => {
    expect(numeroDeAdministracion('Administración 12')).toBe(12)
    expect(numeroDeAdministracion('Administración Prueba')).toBeNull()
    expect(numeroDeAdministracion('Ana Torres')).toBeNull()
    expect(numeroDeAdministracion('Administración 3 bis')).toBeNull()
  })

  it('el siguiente es uno más que el mayor en uso, sea de quien sea el nombre', () => {
    expect(siguienteNumeroAdministracion([])).toBe(1)
    expect(siguienteNumeroAdministracion(['Ana Torres', 'Administración Prueba'])).toBe(1)
    expect(siguienteNumeroAdministracion(['Administración 1', 'Juan', 'Administración 4'])).toBe(5)
  })
})
