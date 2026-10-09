import { describe, expect, it, vi } from 'vitest'
import { cuentasConCorreo, pasarADireccionInterna } from '@/lib/cuentas/borrar-correo'
import { direccionInterna, DOMINIO_INTERNO } from '@/lib/cuentas/usuario'

type Cuenta = { id: string; email?: string }

function admin(opciones: { paginas?: Cuenta[][]; cuenta?: Cuenta; errorCambio?: unknown } = {}) {
  const paginas = opciones.paginas ?? [[]]
  const listUsers = vi.fn(async ({ page }: { page: number; perPage: number }) => ({
    data: { users: paginas[page - 1] ?? [] },
    error: null,
  }))
  const getUserById = vi.fn(async () => ({ data: { user: opciones.cuenta }, error: null }))
  const updateUserById = vi.fn(async () => ({ data: { user: opciones.cuenta }, error: opciones.errorCambio ?? null }))
  return { cliente: { auth: { admin: { listUsers, getUserById, updateUserById } } } as never, listUsers, updateUserById }
}

describe('cuentasConCorreo', () => {
  it('solo las cuentas cuya dirección todavía es un correo de verdad', async () => {
    const { cliente } = admin({
      paginas: [[{ id: 'a', email: 'rflores@gmail.com' }, { id: 'b', email: direccionInterna() }, { id: 'c' }]],
    })
    // Una cuenta sin dirección tampoco es "interna": se lista para que el comando la deje pareja.
    expect(await cuentasConCorreo(cliente)).toEqual(['a', 'c'])
  })

  it('recorre todas las páginas de Auth', async () => {
    const llena = Array.from({ length: 1000 }, (_, i) => ({ id: `p1-${i}`, email: direccionInterna() }))
    const { cliente, listUsers } = admin({ paginas: [llena, [{ id: 'ultima', email: 'ana@centro.org' }]] })
    expect(await cuentasConCorreo(cliente)).toEqual(['ultima'])
    expect(listUsers).toHaveBeenCalledTimes(2)
  })
})

describe('pasarADireccionInterna', () => {
  it('cambia el correo por una dirección interna nueva, ya confirmada', async () => {
    const { cliente, updateUserById } = admin({ cuenta: { id: 'a', email: 'rflores@gmail.com' } })
    expect(await pasarADireccionInterna(cliente, 'a')).toBe('cambiada')
    expect(updateUserById).toHaveBeenCalledWith('a', {
      email: expect.stringMatching(new RegExp(`^[0-9a-f-]{36}@${DOMINIO_INTERNO.replaceAll('.', '\\.')}$`)),
      email_confirm: true,
    })
  })

  it('es idempotente: una cuenta que ya tiene dirección interna no se toca', async () => {
    const { cliente, updateUserById } = admin({ cuenta: { id: 'a', email: direccionInterna() } })
    expect(await pasarADireccionInterna(cliente, 'a')).toBe('ya-interna')
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('si Auth rechaza el cambio, lo dice (el comando sigue con las demás)', async () => {
    const { cliente } = admin({ cuenta: { id: 'a', email: 'rflores@gmail.com' }, errorCambio: new Error('rechazado') })
    await expect(pasarADireccionInterna(cliente, 'a')).rejects.toThrow('rechazado')
  })
})
