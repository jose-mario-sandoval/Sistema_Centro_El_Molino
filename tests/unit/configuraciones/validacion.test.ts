import { describe, expect, it } from 'vitest'
import { camposConError } from '@/lib/validacion/auth'
import {
  esquemaCambioContrasenaPropia,
  esquemaCambioRol,
  esquemaContrasenaTemporal,
  esquemaEstadoCuenta,
  esquemaHorasLimite,
  esquemaNuevaCuenta,
  esquemaPerfilPropio,
} from '@/lib/validacion/configuraciones'

const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

function campos(resultado: { success: boolean; error?: Parameters<typeof camposConError>[0] }) {
  if (resultado.success || !resultado.error) throw new Error('Se esperaba un error de validación')
  return camposConError(resultado.error)
}

describe('esquemaPerfilPropio', () => {
  it('recorta espacios, pasa las siglas a mayúsculas y el correo a minúsculas', () => {
    const r = esquemaPerfilPropio.safeParse({ nombre: '  Juan Pérez ', siglas: ' jp ', correo: ' Juan@Centro.ORG ' })
    expect(r.success && r.data).toEqual({ nombre: 'Juan Pérez', siglas: 'JP', correo: 'juan@centro.org' })
  })

  it('marca cada campo inválido', () => {
    expect(campos(esquemaPerfilPropio.safeParse({ nombre: '  ', siglas: 'ABCDEFG', correo: 'no-es-correo' }))).toEqual({
      nombre: 'Ingresá el nombre.',
      siglas: 'Las siglas pueden tener hasta 6 caracteres.',
      correo: 'Ingresá un correo válido.',
    })
  })
})

describe('esquemaCambioContrasenaPropia', () => {
  const valido = { actual: 'clave-actual-1', nueva: 'clave-nueva-2', confirmacion: 'clave-nueva-2' }

  it('acepta un cambio válido', () => {
    const r = esquemaCambioContrasenaPropia.safeParse(valido)
    expect(r.success && r.data).toEqual(valido)
  })

  it('pide la contraseña actual', () => {
    expect(campos(esquemaCambioContrasenaPropia.safeParse({ ...valido, actual: '' }))).toEqual({
      actual: 'Ingresá tu contraseña actual.',
    })
  })

  it('exige al menos 8 caracteres', () => {
    expect(
      campos(esquemaCambioContrasenaPropia.safeParse({ ...valido, nueva: 'corta', confirmacion: 'corta' })),
    ).toEqual({ nueva: 'La contraseña debe tener al menos 8 caracteres.' })
  })

  it('exige que la confirmación coincida', () => {
    expect(campos(esquemaCambioContrasenaPropia.safeParse({ ...valido, confirmacion: 'otra-cosa-3' }))).toEqual({
      confirmacion: 'Las contraseñas no coinciden.',
    })
  })

  it('rechaza repetir la contraseña actual', () => {
    const misma = { actual: 'misma-clave-1', nueva: 'misma-clave-1', confirmacion: 'misma-clave-1' }
    expect(campos(esquemaCambioContrasenaPropia.safeParse(misma))).toEqual({
      nueva: 'La contraseña nueva debe ser distinta de la actual.',
    })
  })
})

describe('esquemaHorasLimite', () => {
  const formulario = {
    desayuno_dia: '-1',
    desayuno_hora: '21:00',
    almuerzo_dia: '0',
    almuerzo_hora: '10:30',
    cena_dia: '0',
    cena_hora: '16:00:00',
  }

  it('convierte los campos del formulario en HorasLimite', () => {
    const r = esquemaHorasLimite.safeParse(formulario)
    expect(r.success && r.data).toEqual({
      desayuno: { diaRelativo: -1, hora: '21:00' },
      almuerzo: { diaRelativo: 0, hora: '10:30' },
      cena: { diaRelativo: 0, hora: '16:00' },
    })
  })

  it('solo acepta mismo día o día anterior', () => {
    expect(campos(esquemaHorasLimite.safeParse({ ...formulario, almuerzo_dia: '1' }))).toEqual({
      almuerzo_dia: 'Elegí mismo día o día anterior.',
    })
  })

  it('rechaza horas inválidas', () => {
    expect(campos(esquemaHorasLimite.safeParse({ ...formulario, cena_hora: '25:00' }))).toEqual({
      cena_hora: 'Ingresá una hora válida (HH:MM).',
    })
  })
})

describe('esquemaNuevaCuenta', () => {
  const datos = {
    nombre: 'Ana Torres',
    siglas: 'at',
    correo: 'Ana@Centro.org',
    rol: 'administracion',
    contrasena: 'k7hm-pq3x-wn9d',
  }

  it('acepta y normaliza una cuenta nueva', () => {
    const r = esquemaNuevaCuenta.safeParse(datos)
    expect(r.success && r.data).toEqual({ ...datos, siglas: 'AT', correo: 'ana@centro.org' })
  })

  it('rechaza un rol inexistente', () => {
    expect(campos(esquemaNuevaCuenta.safeParse({ ...datos, rol: 'jefe' }))).toEqual({ rol: 'Elegí un rol.' })
  })

  it('exige una contraseña temporal de al menos 8 caracteres', () => {
    expect(campos(esquemaNuevaCuenta.safeParse({ ...datos, contrasena: 'corta' }))).toEqual({
      contrasena: 'La contraseña debe tener al menos 8 caracteres.',
    })
  })
})

describe('acciones sobre otras cuentas', () => {
  it('contraseña temporal: exige un id de cuenta válido', () => {
    expect(esquemaContrasenaTemporal.safeParse({ id: ID, contrasena: 'abcd-efgh-jkmn' }).success).toBe(true)
    expect(campos(esquemaContrasenaTemporal.safeParse({ id: 'no-es-uuid', contrasena: 'abcd-efgh-jkmn' }))).toEqual({
      id: 'Cuenta inválida.',
    })
  })

  it('cambio de rol: solo roles existentes', () => {
    expect(esquemaCambioRol.safeParse({ id: ID, rol: 'residente' }).success).toBe(true)
    expect(esquemaCambioRol.safeParse({ id: ID, rol: 'superusuario' }).success).toBe(false)
  })

  it('estado: activo debe ser booleano', () => {
    expect(esquemaEstadoCuenta.safeParse({ id: ID, activo: false }).success).toBe(true)
    expect(esquemaEstadoCuenta.safeParse({ id: ID, activo: 'false' }).success).toBe(false)
  })
})
