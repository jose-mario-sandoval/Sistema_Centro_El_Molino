import { describe, expect, it } from 'vitest'
import { MENSAJE_CORREO_REPETIDO, MENSAJE_DIRECTOR_MINIMO, mensajeErrorPerfil } from '@/lib/configuraciones/errores'

describe('mensajeErrorPerfil', () => {
  it('traduce la regla de Director activo mínimo (MOL02)', () => {
    expect(mensajeErrorPerfil({ code: 'MOL02' }, 'respaldo')).toBe('Debe quedar al menos un Director activo.')
    expect(MENSAJE_DIRECTOR_MINIMO).toBe('Debe quedar al menos un Director activo.')
  })

  it('traduce el correo repetido (23505)', () => {
    expect(mensajeErrorPerfil({ code: '23505' }, 'respaldo')).toBe(MENSAJE_CORREO_REPETIDO)
  })

  it('usa el mensaje de respaldo para cualquier otro error', () => {
    expect(mensajeErrorPerfil({ code: '42501' }, 'No se pudo cambiar el rol.')).toBe('No se pudo cambiar el rol.')
    expect(mensajeErrorPerfil(null, 'No se pudo cambiar el rol.')).toBe('No se pudo cambiar el rol.')
  })
})
