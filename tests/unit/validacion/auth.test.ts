import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { camposConError, esquemaContrasenaNueva, esquemaLogin } from '@/lib/validacion/auth'

describe('esquemaLogin', () => {
  it('normaliza el correo: quita espacios y pasa a minúsculas', () => {
    const r = esquemaLogin.safeParse({ correo: '  Residente@Demo.TEST ', contrasena: 'x' })
    expect(r.success).toBe(true)
    expect(r.data?.correo).toBe('residente@demo.test')
  })

  it('no modifica la contraseña', () => {
    const r = esquemaLogin.safeParse({ correo: 'a@b.test', contrasena: '  Clave con espacios ' })
    expect(r.data?.contrasena).toBe('  Clave con espacios ')
  })

  it('rechaza un correo inválido con mensaje en el campo correo', () => {
    const r = esquemaLogin.safeParse({ correo: 'no-es-correo', contrasena: 'x' })
    expect(r.success).toBe(false)
    expect(camposConError(r.error!)).toEqual({ correo: 'Ingresá un correo válido.' })
  })

  it('exige la contraseña', () => {
    const r = esquemaLogin.safeParse({ correo: 'a@b.test', contrasena: '' })
    expect(r.success).toBe(false)
    expect(camposConError(r.error!)).toEqual({ contrasena: 'Ingresá tu contraseña.' })
  })

  it('rechaza campos ausentes (FormData.get devuelve null)', () => {
    const r = esquemaLogin.safeParse({ correo: null, contrasena: null })
    expect(r.success).toBe(false)
    expect(Object.keys(camposConError(r.error!)).sort()).toEqual(['contrasena', 'correo'])
  })
})

describe('esquemaContrasenaNueva', () => {
  it('acepta 8 caracteres o más si coinciden', () => {
    expect(esquemaContrasenaNueva.safeParse({ nueva: '12345678', confirmacion: '12345678' }).success).toBe(true)
  })

  it('rechaza menos de 8 caracteres en el campo nueva', () => {
    const r = esquemaContrasenaNueva.safeParse({ nueva: '1234567', confirmacion: '1234567' })
    expect(r.success).toBe(false)
    expect(camposConError(r.error!)).toEqual({ nueva: 'La contraseña debe tener al menos 8 caracteres.' })
  })

  it('marca la confirmación cuando no coincide', () => {
    const r = esquemaContrasenaNueva.safeParse({ nueva: 'clave-larga-1', confirmacion: 'clave-larga-2' })
    expect(r.success).toBe(false)
    expect(r.error!.issues[0].path).toEqual(['confirmacion'])
    expect(camposConError(r.error!)).toEqual({ confirmacion: 'Las contraseñas no coinciden.' })
  })
})

describe('camposConError', () => {
  it('se queda con el primer mensaje de cada campo', () => {
    const esquema = z.object({ clave: z.string().min(3, 'Muy corta.').regex(/\d/, 'Falta un número.') })
    const r = esquema.safeParse({ clave: 'a' })
    expect(r.error!.issues).toHaveLength(2)
    expect(camposConError(r.error!)).toEqual({ clave: 'Muy corta.' })
  })

  it('usa "formulario" para errores sin ruta', () => {
    const esquema = z.string().refine(() => false, 'Error general.')
    const r = esquema.safeParse('x')
    expect(camposConError(r.error!)).toEqual({ formulario: 'Error general.' })
  })

  it('devuelve un objeto vacío si no hay issues', () => {
    expect(camposConError(new z.ZodError([]))).toEqual({})
  })
})
