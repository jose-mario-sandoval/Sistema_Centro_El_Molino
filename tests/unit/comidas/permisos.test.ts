import { describe, expect, it } from 'vitest'
import { usuarioObjetivo } from '@/lib/comidas/permisos'

const DIRECTOR = { id: '0b8f7c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', rol: 'director' as const }
const RESIDENTE = { id: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b', rol: 'residente' as const }
const ADMINISTRACION = { id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', rol: 'administracion' as const }
const OTRA = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f'

describe('usuarioObjetivo: de quién son las comidas que se cambian', () => {
  it.each([undefined, null, ''])('sin pedido (%s), son las propias', (pedido) => {
    expect(usuarioObjetivo(DIRECTOR, pedido)).toEqual({ ok: true, usuarioId: DIRECTOR.id })
    expect(usuarioObjetivo(RESIDENTE, pedido)).toEqual({ ok: true, usuarioId: RESIDENTE.id })
  })

  it('pedir las propias es lo mismo que no pedir nada', () => {
    expect(usuarioObjetivo(RESIDENTE, RESIDENTE.id)).toEqual({ ok: true, usuarioId: RESIDENTE.id })
  })

  it('el Director puede actuar por otra persona (la base comprueba que tenga comidas)', () => {
    expect(usuarioObjetivo(DIRECTOR, OTRA)).toEqual({ ok: true, usuarioId: OTRA })
  })

  it('un Residente no puede actuar por otra persona', () => {
    expect(usuarioObjetivo(RESIDENTE, OTRA)).toEqual({ ok: false, error: 'No tenés permiso para hacer esto.' })
  })

  it('Administración no tiene comidas: ni propias ni de nadie', () => {
    expect(usuarioObjetivo(ADMINISTRACION)).toEqual({ ok: false, error: 'No tenés permiso para hacer esto.' })
    expect(usuarioObjetivo(ADMINISTRACION, OTRA)).toEqual({ ok: false, error: 'No tenés permiso para hacer esto.' })
  })
})
