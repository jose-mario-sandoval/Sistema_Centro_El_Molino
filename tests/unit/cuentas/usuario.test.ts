import { describe, expect, it } from 'vitest'
import {
  direccionInterna,
  DOMINIO_INTERNO,
  esDireccionInterna,
  FORMATO_USUARIO,
  normalizarUsuario,
  usuarioDesdeCorreo,
  usuarioParaEntrar,
  usuarioValido,
} from '@/lib/cuentas/usuario'
import casos from '@/tests/fixtures/casos-usuario.json'

describe('normalizarUsuario', () => {
  it('quita espacios de los extremos, pasa a minúsculas y quita tildes y la virgulilla', () => {
    expect(normalizarUsuario('  R.Flores ')).toBe('r.flores')
    expect(normalizarUsuario('MUÑOZ')).toBe('munoz')
    expect(normalizarUsuario('José.Peña')).toBe('jose.pena')
    // Aunque el teléfono mande la tilde como marca aparte (NFD).
    expect(normalizarUsuario('josé')).toBe('jose')
  })
})

describe('usuarioValido', () => {
  it.each(['r.flores', 'admin.1', 'juan_perez-2', 'abc', 'a'.repeat(30)])('acepta %s', (usuario) => {
    expect(usuarioValido(usuario)).toBe(true)
  })

  it.each(['ab', 'a'.repeat(31), 'R.Flores', 'r..flores', '.rflores', 'rflores.', 'r flores', 'r@flores', 'muñoz', ''])(
    'rechaza %s',
    (usuario) => {
      expect(usuarioValido(usuario)).toBe(false)
    },
  )
})

describe('usuarioDesdeCorreo: la limpieza de la migración (casos compartidos con el banco SQL)', () => {
  it.each(casos.casos as [string, string][])('%s → %s', (correo, usuario) => {
    expect(usuarioDesdeCorreo(correo)).toBe(usuario)
  })

  it('lo que devuelve siempre cumple el formato', () => {
    for (const [correo] of casos.casos as [string, string][]) {
      expect(usuarioValido(usuarioDesdeCorreo(correo)), correo).toBe(true)
    }
    expect(FORMATO_USUARIO.test('cuenta')).toBe(true)
  })
})

describe('usuarioParaEntrar: lo que se escribió en el login', () => {
  it('un usuario, normalizado', () => {
    expect(usuarioParaEntrar(' R.Flores ')).toBe('r.flores')
  })

  it('un correo (costumbre, o lo rellenó el teléfono): el usuario que le tocó a esa cuenta', () => {
    expect(usuarioParaEntrar('RFlores@Gmail.com')).toBe('rflores')
    expect(usuarioParaEntrar('juan+algo@centro.org')).toBe('juanalgo')
  })
})

describe('direcciones internas de Auth', () => {
  it('cada cuenta nueva recibe una distinta, en el dominio interno', () => {
    const a = direccionInterna()
    expect(a).toMatch(new RegExp(`^[0-9a-f-]{36}@${DOMINIO_INTERNO.replaceAll('.', '\.')}$`))
    expect(direccionInterna()).not.toBe(a)
  })

  it('se reconocen', () => {
    expect(esDireccionInterna(direccionInterna())).toBe(true)
    expect(esDireccionInterna('rflores@gmail.com')).toBe(false)
    expect(esDireccionInterna(null)).toBe(false)
  })
})
