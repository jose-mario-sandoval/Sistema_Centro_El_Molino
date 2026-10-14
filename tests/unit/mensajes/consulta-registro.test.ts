import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { consultarRegistroModeracion, type EntradaRegistro } from '@/lib/mensajes/consulta-registro'
import type { Database } from '@/lib/supabase/database.types'

const INSTANTE = '2026-10-13T16:05:00.123456+00:00'

function entrada(numero: number): EntradaRegistro {
  return {
    id: `00000000-0000-4000-8000-${numero.toString(16).padStart(12, '0')}`,
    moderador_id: '00000000-0000-4000-8000-000000000001',
    autor_id: '00000000-0000-4000-8000-000000000002',
    texto_eliminado: `Mensaje eliminado ${numero}`,
    era_respuesta: false,
    eliminado_en: INSTANTE,
  }
}

/** Usa el cliente real: se verifica el filtro que llegará a PostgREST, sin depender de la base. */
function clienteConRespuesta(cuerpo: unknown, status = 200) {
  const fetchPrueba = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }))
  const cliente = createClient<Database>('http://supabase.test', 'clave-prueba', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchPrueba },
  })
  function peticion() {
    expect(fetchPrueba).toHaveBeenCalledTimes(1)
    const destino = fetchPrueba.mock.calls[0][0]
    return new URL(typeof destino === 'string' ? destino : destino instanceof URL ? destino.href : destino.url)
  }
  return { cliente, peticion }
}

describe('consultarRegistroModeracion', () => {
  it('el registro vacío termina sin cursor ni otra página', async () => {
    const { cliente, peticion } = clienteConRespuesta([])

    expect(await consultarRegistroModeracion(cliente)).toEqual({ entradas: [], hayMas: false, cursor: null })
    const url = peticion()
    expect(url.pathname).toBe('/rest/v1/registro_moderacion')
    expect(url.searchParams.has('or')).toBe(false)
  })

  it('20 entradas exactas se muestran completas sin ofrecer otra página', async () => {
    const filas = Array.from({ length: 20 }, (_, i) => entrada(20 - i))
    const { cliente } = clienteConRespuesta(filas)

    expect(await consultarRegistroModeracion(cliente)).toEqual({ entradas: filas, hayMas: false, cursor: null })
  })

  it('reserva la entrada 21 y conserva como cursor la fecha exacta e id de la entrada 20', async () => {
    const filas = Array.from({ length: 21 }, (_, i) => entrada(21 - i))
    const { cliente, peticion } = clienteConRespuesta(filas)

    expect(await consultarRegistroModeracion(cliente)).toEqual({
      entradas: filas.slice(0, 20),
      hayMas: true,
      cursor: { eliminadoEn: INSTANTE, id: filas[19].id },
    })
    expect(peticion().searchParams.get('limit')).toBe('21')
  })

  it('carga antes de la fecha o antes del id empatado, con el mismo orden compuesto', async () => {
    const cursor = { eliminadoEn: INSTANTE, id: entrada(10).id }
    const { cliente, peticion } = clienteConRespuesta([])

    await consultarRegistroModeracion(cliente, cursor)

    const parametros = peticion().searchParams
    expect(parametros.get('or')).toBe(
      `(eliminado_en.lt.${INSTANTE},and(eliminado_en.eq.${INSTANTE},id.lt.${cursor.id}))`,
    )
    expect(parametros.get('order')).toBe('eliminado_en.desc,id.desc')
    expect(parametros.get('limit')).toBe('21')
    expect(parametros.has('offset')).toBe(false)
  })

  it('propaga el error de PostgREST en vez de presentar una página vacía', async () => {
    const error = { code: '42501', message: 'permission denied', details: null, hint: null }
    const { cliente } = clienteConRespuesta(error, 403)

    await expect(consultarRegistroModeracion(cliente)).rejects.toMatchObject(error)
  })
})
