import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RETARDO_RECUENTO_MS, vigilarPendientes, type DocumentoVisible } from '@/lib/mensajes/vigilar-pendientes'
import type { Database } from '@/lib/supabase/database.types'

type Canal = {
  alCambio?: () => void
  alEstado?: (estado: string) => void
  on: (tipo: string, filtro: unknown, cb: () => void) => Canal
  subscribe: (cb: (estado: string) => void) => Canal
}

/** Cliente de Supabase falso: registra los canales creados y cuenta lo que diga `conteo`. */
function clienteFalso({ fallasSetAuth = 0 } = {}) {
  const canales: Canal[] = []
  let conteo = 3
  let fallas = fallasSetAuth
  const cliente = {
    realtime: {
      setAuth: vi.fn(async () => {
        if (fallas-- > 0) throw new Error('sin token')
      }),
    },
    channel: vi.fn(() => {
      const canal: Canal = {
        on: (_tipo, _filtro, cb) => {
          canal.alCambio = cb
          return canal
        },
        subscribe: (cb) => {
          canal.alEstado = cb
          return canal
        },
      }
      canales.push(canal)
      return canal
    }),
    removeChannel: vi.fn(async () => 'ok'),
    from: () => ({ select: () => ({ eq: async () => ({ count: conteo, error: null }) }) }),
  }
  return {
    supabase: cliente as unknown as SupabaseClient<Database>,
    cliente,
    canales,
    ponerConteo: (n: number) => {
      conteo = n
    },
  }
}

function documentoFalso() {
  let alCambiar: (() => void) | undefined
  const documento = {
    hidden: false,
    addEventListener: vi.fn((_evento: string, cb: () => void) => {
      alCambiar = cb
    }),
    removeEventListener: vi.fn(),
  }
  return {
    documento: documento as DocumentoVisible & typeof documento,
    volverALaPestana: () => {
      documento.hidden = false
      alCambiar?.()
    },
  }
}

/** esperaReintento(0) con azar 0.5: 3 s justos. */
const PRIMER_REINTENTO_MS = 3_000

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('vigilarPendientes', () => {
  it('se suscribe y cuenta al conectarse', async () => {
    const { supabase, canales } = clienteFalso()
    const alContar = vi.fn()
    vigilarPendientes({ supabase, alContar, documento: documentoFalso().documento })
    await vi.advanceTimersByTimeAsync(0)
    expect(canales).toHaveLength(1)
    canales[0].alEstado!('SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(RETARDO_RECUENTO_MS)
    expect(alContar).toHaveBeenCalledWith(3)
  })

  it('varios cambios seguidos en mensajes se cuentan una sola vez, con retardo', async () => {
    const { supabase, canales, ponerConteo } = clienteFalso()
    const alContar = vi.fn()
    vigilarPendientes({ supabase, alContar, documento: documentoFalso().documento })
    await vi.advanceTimersByTimeAsync(0)
    canales[0].alEstado!('SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(RETARDO_RECUENTO_MS)
    alContar.mockClear()

    ponerConteo(5)
    canales[0].alCambio!()
    canales[0].alCambio!()
    await vi.advanceTimersByTimeAsync(RETARDO_RECUENTO_MS - 1)
    canales[0].alCambio!()
    expect(alContar).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(RETARDO_RECUENTO_MS)
    expect(alContar.mock.calls).toEqual([[5]])
  })

  it('si el canal se cierra, crea otro después de esperar, y vuelve a contar al conectarse', async () => {
    const { supabase, cliente, canales, ponerConteo } = clienteFalso()
    const alContar = vi.fn()
    vigilarPendientes({ supabase, alContar, documento: documentoFalso().documento })
    await vi.advanceTimersByTimeAsync(0)
    canales[0].alEstado!('SUBSCRIBED')
    canales[0].alEstado!('CLOSED')
    await vi.advanceTimersByTimeAsync(PRIMER_REINTENTO_MS - 1)
    expect(canales).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(canales).toHaveLength(2)
    expect(cliente.removeChannel).toHaveBeenCalledWith(canales[0])

    ponerConteo(7)
    canales[1].alEstado!('SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(RETARDO_RECUENTO_MS)
    expect(alContar).toHaveBeenLastCalledWith(7)
    // Lo que avise el canal viejo ya no cuenta.
    canales[0].alEstado!('CLOSED')
    await vi.advanceTimersByTimeAsync(PRIMER_REINTENTO_MS * 4)
    expect(canales).toHaveLength(2)
  })

  it('cada cierre seguido espera más; al conectarse vuelve a la espera inicial', async () => {
    const { supabase, canales } = clienteFalso()
    vigilarPendientes({ supabase, alContar: vi.fn(), documento: documentoFalso().documento })
    await vi.advanceTimersByTimeAsync(0)
    canales[0].alEstado!('CLOSED')
    await vi.advanceTimersByTimeAsync(PRIMER_REINTENTO_MS)
    canales[1].alEstado!('CLOSED')
    await vi.advanceTimersByTimeAsync(PRIMER_REINTENTO_MS)
    expect(canales).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(PRIMER_REINTENTO_MS)
    expect(canales).toHaveLength(3)

    canales[2].alEstado!('SUBSCRIBED')
    canales[2].alEstado!('CLOSED')
    await vi.advanceTimersByTimeAsync(PRIMER_REINTENTO_MS)
    expect(canales).toHaveLength(4)
  })

  it('si no hay token (setAuth falla), reintenta en vez de quedarse sin canal', async () => {
    const { supabase, cliente, canales } = clienteFalso({ fallasSetAuth: 1 })
    vigilarPendientes({ supabase, alContar: vi.fn(), documento: documentoFalso().documento })
    await vi.advanceTimersByTimeAsync(0)
    expect(canales).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(PRIMER_REINTENTO_MS)
    expect(cliente.realtime.setAuth).toHaveBeenCalledTimes(2)
    expect(canales).toHaveLength(1)
  })

  it('con la pestaña oculta el canal nuevo espera a que vuelva; al volver, recuenta', async () => {
    const { supabase, canales } = clienteFalso()
    const { documento, volverALaPestana } = documentoFalso()
    const alContar = vi.fn()
    vigilarPendientes({ supabase, alContar, documento })
    await vi.advanceTimersByTimeAsync(0)
    documento.hidden = true
    canales[0].alEstado!('CLOSED')
    await vi.advanceTimersByTimeAsync(PRIMER_REINTENTO_MS * 10)
    expect(canales).toHaveLength(1)

    volverALaPestana()
    await vi.advanceTimersByTimeAsync(0)
    expect(canales).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(RETARDO_RECUENTO_MS)
    expect(alContar).toHaveBeenCalledWith(3)
  })

  it('al terminar quita el canal, deja de escuchar la pestaña y no vuelve a contar ni a reconectar', async () => {
    const { supabase, cliente, canales } = clienteFalso()
    const { documento } = documentoFalso()
    const alContar = vi.fn()
    const detener = vigilarPendientes({ supabase, alContar, documento })
    await vi.advanceTimersByTimeAsync(0)
    canales[0].alEstado!('SUBSCRIBED')
    detener()
    expect(cliente.removeChannel).toHaveBeenCalledWith(canales[0])
    expect(documento.removeEventListener).toHaveBeenCalled()
    canales[0].alEstado!('CLOSED')
    canales[0].alCambio!()
    await vi.advanceTimersByTimeAsync(PRIMER_REINTENTO_MS * 4)
    expect(alContar).not.toHaveBeenCalled()
    expect(canales).toHaveLength(1)
  })
})
