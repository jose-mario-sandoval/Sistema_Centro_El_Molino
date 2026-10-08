import { beforeEach, describe, expect, it, vi } from 'vitest'
import { direccionDeAcceso } from '@/lib/cuentas/direccion-de-acceso'
import { DIRECCION_INEXISTENTE } from '@/lib/cuentas/usuario'

const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

type Respuesta = { data: unknown; error: unknown }

function admin(perfil: Respuesta, cuenta?: Respuesta) {
  const eq = vi.fn(() => ({ maybeSingle: async () => perfil }))
  const getUserById = vi.fn(async () => cuenta ?? { data: { user: null }, error: null })
  const cliente = { from: vi.fn(() => ({ select: () => ({ eq }) })), auth: { admin: { getUserById } } }
  return { cliente: cliente as never, eq, getUserById }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('direccionDeAcceso: del usuario a la dirección con la que Auth conoce a la cuenta', () => {
  it('la dirección que guarda Auth, sea interna o el correo de una cuenta vieja', async () => {
    const { cliente, eq, getUserById } = admin(
      { data: { id: ID }, error: null },
      { data: { user: { id: ID, email: 'rflores@gmail.com' } }, error: null },
    )
    expect(await direccionDeAcceso(cliente, 'r.flores')).toEqual({ ok: true, correo: 'rflores@gmail.com' })
    expect(eq).toHaveBeenCalledWith('usuario', 'r.flores')
    expect(getUserById).toHaveBeenCalledWith(ID)
  })

  it('un usuario que no existe: una dirección que no es de nadie, sin consultar Auth', async () => {
    const { cliente, getUserById } = admin({ data: null, error: null })
    expect(await direccionDeAcceso(cliente, 'nadie')).toEqual({ ok: true, correo: DIRECCION_INEXISTENTE })
    expect(getUserById).not.toHaveBeenCalled()
  })

  it('un perfil sin cuenta de Auth (404) se trata igual que un usuario que no existe', async () => {
    const { cliente } = admin({ data: { id: ID }, error: null }, { data: { user: null }, error: { status: 404 } })
    expect(await direccionDeAcceso(cliente, 'r.flores')).toEqual({ ok: true, correo: DIRECCION_INEXISTENTE })
  })

  it('una cuenta de Auth sin dirección tampoco deja entrar', async () => {
    const { cliente } = admin({ data: { id: ID }, error: null }, { data: { user: { id: ID } }, error: null })
    expect(await direccionDeAcceso(cliente, 'r.flores')).toEqual({ ok: true, correo: DIRECCION_INEXISTENTE })
  })

  it('si la base o Auth no responden, no se sabe: `ok: false` (no es "usuario inexistente")', async () => {
    expect(await direccionDeAcceso(admin({ data: null, error: { code: '08006' } }).cliente, 'r.flores')).toEqual({ ok: false })
    const conAuthCaido = admin({ data: { id: ID }, error: null }, { data: { user: null }, error: { status: 500 } })
    expect(await direccionDeAcceso(conAuthCaido.cliente, 'r.flores')).toEqual({ ok: false })
  })
})
