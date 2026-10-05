import { describe, expect, it } from 'vitest'
import { camposConError } from '@/lib/validacion/auth'
import {
  esquemaCambioContrasenaPropia,
  esquemaCambioRol,
  esquemaCambioUsuario,
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
  it('recorta espacios y pasa las siglas a mayúsculas; el usuario no se cambia desde Mi cuenta', () => {
    const r = esquemaPerfilPropio.safeParse({ nombre: '  Juan Pérez ', siglas: ' jp ', usuario: 'otro' })
    expect(r.success && r.data).toEqual({ nombre: 'Juan Pérez', siglas: 'JP' })
  })

  it('marca cada campo inválido', () => {
    expect(campos(esquemaPerfilPropio.safeParse({ nombre: '  ', siglas: 'ABCDEFG' }))).toEqual({
      nombre: 'Ingresá el nombre.',
      siglas: 'Las siglas pueden tener hasta 6 caracteres.',
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

  it('acepta hasta 72 caracteres', () => {
    const larga = 'b'.repeat(72)
    expect(esquemaCambioContrasenaPropia.safeParse({ ...valido, nueva: larga, confirmacion: larga }).success).toBe(true)
    const demasiado = 'b'.repeat(73)
    expect(
      campos(esquemaCambioContrasenaPropia.safeParse({ ...valido, nueva: demasiado, confirmacion: demasiado })),
    ).toEqual({ nueva: 'La contraseña puede tener hasta 72 caracteres.' })
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
  const datos = { nombre: 'Ana Torres', siglas: 'at', usuario: ' A.Torres ', rol: 'residente', contrasena: 'k7hm-pq3x-wn9d' }

  it('una cuenta de la casa: nombre, siglas y usuario normalizados', () => {
    const r = esquemaNuevaCuenta.safeParse(datos)
    expect(r.success && r.data).toEqual({ ...datos, siglas: 'AT', usuario: 'a.torres' })
  })

  it('una cuenta de Administración no lleva nombre ni siglas (los pone el servidor)', () => {
    const r = esquemaNuevaCuenta.safeParse({ rol: 'administracion', usuario: 'admin.3', contrasena: datos.contrasena, nombre: 'Ana' })
    expect(r.success && r.data).toEqual({ rol: 'administracion', usuario: 'admin.3', contrasena: datos.contrasena })
  })

  it('a una cuenta de la casa le pide nombre y siglas', () => {
    expect(campos(esquemaNuevaCuenta.safeParse({ ...datos, nombre: '', siglas: '' }))).toEqual({
      nombre: 'Ingresá el nombre.',
      siglas: 'Ingresá las siglas.',
    })
    // Sin los campos (FormData de un formulario que no los pintó): también.
    const sinNombre = { usuario: datos.usuario, rol: datos.rol, contrasena: datos.contrasena }
    expect(Object.keys(campos(esquemaNuevaCuenta.safeParse(sinNombre))).sort()).toEqual(['nombre', 'siglas'])
  })

  it.each([
    ['ab', 'El usuario debe tener al menos 3 caracteres.'],
    ['a'.repeat(31), 'El usuario puede tener hasta 30 caracteres.'],
    ['r flores', 'Usá solo letras sin tilde, números, punto, guion o guion bajo. Ejemplo: r.flores'],
    ['r..flores', 'Usá solo letras sin tilde, números, punto, guion o guion bajo. Ejemplo: r.flores'],
    ['rflores@gmail.com', 'Usá solo letras sin tilde, números, punto, guion o guion bajo. Ejemplo: r.flores'],
    ['demo.director', 'Ese usuario está reservado. Elegí otro.'],
  ])('usuario %s: %s', (usuario, mensaje) => {
    expect(campos(esquemaNuevaCuenta.safeParse({ ...datos, usuario }))).toEqual({ usuario: mensaje })
  })

  it('rechaza un rol inexistente', () => {
    expect(campos(esquemaNuevaCuenta.safeParse({ ...datos, rol: 'jefe' }))).toEqual({ rol: 'Elegí un rol.' })
    expect(campos(esquemaNuevaCuenta.safeParse({ ...datos, rol: null }))).toEqual({ rol: 'Elegí un rol.' })
  })

  it('exige una contraseña temporal de al menos 8 caracteres', () => {
    expect(campos(esquemaNuevaCuenta.safeParse({ ...datos, contrasena: 'corta' }))).toEqual({
      contrasena: 'La contraseña debe tener al menos 8 caracteres.',
    })
  })

  it('acepta hasta 72 caracteres de contraseña temporal (límite de Supabase Auth)', () => {
    expect(esquemaNuevaCuenta.safeParse({ ...datos, contrasena: 'a'.repeat(72) }).success).toBe(true)
    expect(campos(esquemaNuevaCuenta.safeParse({ ...datos, contrasena: 'a'.repeat(73) }))).toEqual({
      contrasena: 'La contraseña puede tener hasta 72 caracteres.',
    })
  })
})

describe('esquemaCambioUsuario', () => {
  it('normaliza el usuario nuevo', () => {
    expect(esquemaCambioUsuario.safeParse({ id: ID, usuario: ' R.Muñoz ' })).toMatchObject({
      success: true,
      data: { id: ID, usuario: 'r.munoz' },
    })
  })

  it('con el mismo formato que al crear la cuenta', () => {
    expect(campos(esquemaCambioUsuario.safeParse({ id: ID, usuario: 'ab' }))).toEqual({
      usuario: 'El usuario debe tener al menos 3 caracteres.',
    })
    expect(campos(esquemaCambioUsuario.safeParse({ id: ID, usuario: null }))).toHaveProperty('usuario')
  })
})

describe('acciones sobre otras cuentas', () => {
  it('contraseña temporal: entre 8 y 72 caracteres', () => {
    expect(campos(esquemaContrasenaTemporal.safeParse({ id: ID, contrasena: 'c'.repeat(73) }))).toEqual({
      contrasena: 'La contraseña puede tener hasta 72 caracteres.',
    })
  })

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
