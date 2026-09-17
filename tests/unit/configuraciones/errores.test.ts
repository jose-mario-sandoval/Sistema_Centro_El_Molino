import { AuthApiError, AuthRetryableFetchError, AuthUnknownError, AuthWeakPasswordError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  esErrorAuthDefinitivo,
  esErrorPerfilEsperado,
  MENSAJE_CORREO_REPETIDO,
  MENSAJE_DIRECTOR_MINIMO,
  mensajeErrorPerfil,
} from '@/lib/configuraciones/errores'

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

describe('esErrorPerfilEsperado', () => {
  it('solo las reglas del negocio (MOL02 y 23505) son esperadas', () => {
    expect(esErrorPerfilEsperado({ code: 'MOL02' })).toBe(true)
    expect(esErrorPerfilEsperado({ code: '23505' })).toBe(true)
    expect(esErrorPerfilEsperado({ code: '08006' })).toBe(false)
    expect(esErrorPerfilEsperado(null)).toBe(false)
  })
})

describe('esErrorAuthDefinitivo', () => {
  it('un rechazo 4xx de Auth es definitivo: el cambio no se aplicó', () => {
    expect(esErrorAuthDefinitivo(new AuthApiError('Usuario no encontrado', 404, 'user_not_found'))).toBe(true)
    expect(esErrorAuthDefinitivo(new AuthWeakPasswordError('Débil', 422, ['length']))).toBe(true)
  })

  it('sin respuesta, con un 5xx o sin estado es ambiguo', () => {
    expect(esErrorAuthDefinitivo(new AuthRetryableFetchError('fetch failed', 0))).toBe(false)
    expect(esErrorAuthDefinitivo(new AuthRetryableFetchError('Bad Gateway', 502))).toBe(false)
    expect(esErrorAuthDefinitivo(new AuthApiError('Internal error', 500, 'unexpected_failure'))).toBe(false)
    expect(esErrorAuthDefinitivo(new AuthUnknownError('JSON inválido', new SyntaxError('x')))).toBe(false)
  })
})
