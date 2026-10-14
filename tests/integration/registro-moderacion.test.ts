import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Client } from 'pg'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { consultarRegistroModeracion } from '@/lib/mensajes/consulta-registro'
import type { Database } from '@/lib/supabase/database.types'
import { exigirBaseLocal } from '../soporte/entorno-local'
import { asegurarUsuariosPrueba, clienteAdminPrueba, clienteComo, type ClaveUsuario } from '../soporte/usuarios-prueba'

const PREFIJO = 'integracion-registro-retencion'
const ZONAS = ['UTC', 'America/El_Salvador', 'America/New_York'] as const
const CASOS_RETENCION = [
  { caso: 'día 30', eliminado: '2030-01-30T12:00:00Z', vence: '2030-04-30T12:00:00Z' },
  { caso: '31 de enero a 30 de abril', eliminado: '2030-01-31T12:00:00Z', vence: '2030-04-30T12:00:00Z' },
  { caso: 'febrero no bisiesto', eliminado: '2030-11-30T12:00:00Z', vence: '2031-02-28T12:00:00Z' },
  { caso: 'febrero bisiesto', eliminado: '2031-11-30T12:00:00Z', vence: '2032-02-29T12:00:00Z' },
  { caso: 'eliminación el 29 de febrero', eliminado: '2032-02-29T12:00:00Z', vence: '2032-05-29T12:00:00Z' },
  { caso: 'cambio de horario de verano', eliminado: '2030-02-12T12:00:00Z', vence: '2030-05-12T12:00:00Z' },
  { caso: 'cambio de mes en UTC', eliminado: '2030-01-31T23:30:00-06:00', vence: '2030-05-01T05:30:00Z' },
]
const admin = clienteAdminPrueba()
let ids: Record<ClaveUsuario, string>

beforeAll(async () => {
  ids = await asegurarUsuariosPrueba()
})

afterEach(async () => {
  const { error } = await admin.from('registro_moderacion').delete().like('texto_eliminado', `${PREFIJO}%`)
  if (error) throw error
})

async function conPostgres<T>(fn: (cliente: Client) => Promise<T>): Promise<T> {
  exigirBaseLocal()
  const url = process.env.SUPABASE_DB_URL ?? ''
  const cliente = new Client({ connectionString: url })
  // pg permite sobreescribir el host de la URL con ?host=...: validar el destino resuelto.
  if (!['127.0.0.1', 'localhost'].includes(cliente.host)) throw new Error('Solo se permite la base local de CI.')
  await cliente.connect()
  try {
    return await fn(cliente)
  } finally {
    await cliente.end()
  }
}

describe('registro: páginas de 20', () => {
  it('carga 20, 20 y 3 sin saltar ni repetir eliminaciones con la misma fecha', async () => {
    const instante = new Date().toISOString()
    const filas = Array.from({ length: 43 }, (_, i) => ({
      id: randomUUID(),
      moderador_id: ids.director,
      autor_id: ids.residente,
      texto_eliminado: `${PREFIJO} página ${i}`,
      era_respuesta: false,
      eliminado_en: instante,
    }))
    const { error } = await admin.from('registro_moderacion').insert(filas)
    expect(error).toBeNull()
    const director = (await clienteComo('director')) as unknown as SupabaseClient<Database>
    const primera = await consultarRegistroModeracion(director)
    expect(primera.entradas).toHaveLength(20)
    expect(primera.hayMas).toBe(true)
    const segunda = await consultarRegistroModeracion(director, primera.cursor)
    expect(segunda.entradas).toHaveLength(20)
    expect(segunda.hayMas).toBe(true)
    const tercera = await consultarRegistroModeracion(director, segunda.cursor)
    expect(tercera.entradas).toHaveLength(3)
    expect(tercera.hayMas).toBe(false)
    expect(tercera.cursor).toBeNull()
    const cargados = [...primera.entradas, ...segunda.entradas, ...tercera.entradas].map((e) => e.id)
    expect(cargados).toEqual(filas.map((f) => f.id).sort().reverse())
    for (const clave of ['residente', 'administracion'] as const) {
      const cliente = (await clienteComo(clave)) as unknown as SupabaseClient<Database>
      expect((await consultarRegistroModeracion(cliente)).entradas).toEqual([])
    }
  })
})

describe('registro: tres meses calendario', () => {
  it.each(CASOS_RETENCION.flatMap((caso) => ZONAS.map((zona) => ({ ...caso, zona }))))(
    '$caso en sesión $zona: borra el límite exacto y conserva el siguiente microsegundo',
    async ({ eliminado, vence, zona }) => {
      await conPostgres(async (c) => {
        await c.query('begin')
        try {
          await c.query("select set_config('TimeZone', $1, true)", [zona])
          await c.query(
            `insert into public.registro_moderacion (moderador_id, autor_id, texto_eliminado, era_respuesta, eliminado_en)
             values ($1, $2, $3 || '-anterior', false, $4::timestamptz - interval '1 microsecond'),
                    ($1, $2, $3 || '-exacto', false, $4::timestamptz),
                    ($1, $2, $3 || '-reciente', false, $4::timestamptz + interval '1 microsecond')`,
            [ids.director, ids.residente, PREFIJO, eliminado],
          )
          const mensajesAntes = await c.query('select id from public.mensajes order by id')
          await c.query('call public.limpiar_registro_moderacion($1::timestamptz)', [vence])
          const { rows } = await c.query(
            'select texto_eliminado from public.registro_moderacion where texto_eliminado like $1',
            [`${PREFIJO}%`],
          )
          expect(rows).toEqual([{ texto_eliminado: `${PREFIJO}-reciente` }])
          expect((await c.query('select id from public.mensajes order by id')).rows).toEqual(mensajesAntes.rows)
        } finally {
          await c.query('rollback')
        }
      })
    },
  )

  it.each(ZONAS)('RLS oculta lo vencido antes de la limpieza diaria en sesión %s', async (zona) => {
    await conPostgres(async (c) => {
      await c.query('begin')
      try {
        await c.query("select set_config('TimeZone', $1, true)", [zona])
        await c.query(
          `insert into public.registro_moderacion (moderador_id, autor_id, texto_eliminado, era_respuesta, eliminado_en)
           values ($1, $2, $3 || '-cumplido', false,
                     ((now() at time zone 'UTC') - interval '3 months') at time zone 'UTC'),
                  ($1, $2, $3 || '-reciente', false, now())`,
          [ids.director, ids.residente, PREFIJO],
        )
        await c.query('set local role authenticated')
        for (const clave of ['director', 'residente', 'administracion'] as const) {
          await c.query("select set_config('request.jwt.claims', $1, true)", [
            JSON.stringify({ sub: ids[clave], role: 'authenticated' }),
          ])
          const { rows } = await c.query(
            'select texto_eliminado from public.registro_moderacion where texto_eliminado like $1',
            [`${PREFIJO}%`],
          )
          expect(rows).toEqual(clave === 'director' ? [{ texto_eliminado: `${PREFIJO}-reciente` }] : [])
        }
        await c.query('reset role')
        const conservados = await c.query(
          'select id from public.registro_moderacion where texto_eliminado like $1',
          [`${PREFIJO}%`],
        )
        expect(conservados.rows).toHaveLength(2)
      } finally {
        await c.query('rollback')
      }
    })
  })

  it('la limpieza está programada a diario y no se puede ejecutar con roles de la API', async () => {
    await conPostgres(async (c) => {
      const propietario = await c.query(
        `select pg_get_userbyid(proowner) as rol, prosecdef as definer
         from pg_proc where oid = 'public.limpiar_registro_moderacion(timestamptz)'::regprocedure`,
      )
      expect(propietario.rows[0].definer).toBe(false)
      const base = await c.query('select current_database() as nombre')
      const { rows } = await c.query(
        "select schedule, command, active, username, database from cron.job where jobname = 'limpiar-registro-moderacion'",
      )
      expect(rows).toEqual([{
        schedule: '30 3 * * *',
        command: 'CALL public.limpiar_registro_moderacion()',
        active: true,
        username: propietario.rows[0].rol,
        database: base.rows[0].nombre,
      }])
      const propietarioPuedeLimpiar = await c.query(
        `select has_table_privilege($1, 'public.registro_moderacion', 'DELETE') as borra,
                has_function_privilege($1, 'public.limpiar_registro_moderacion(timestamptz)', 'EXECUTE') as ejecuta`,
        [propietario.rows[0].rol],
      )
      expect(propietarioPuedeLimpiar.rows).toEqual([{ borra: true, ejecuta: true }])
      for (const rol of ['anon', 'authenticated', 'service_role']) {
        const permiso = await c.query(
          "select has_function_privilege($1, 'public.limpiar_registro_moderacion(timestamptz)', 'EXECUTE') as permitido",
          [rol],
        )
        expect(permiso.rows[0].permitido).toBe(false)
        await c.query('begin')
        try {
          await c.query(`set local role ${rol}`)
          await expect(c.query('call public.limpiar_registro_moderacion()')).rejects.toMatchObject({ code: '42501' })
        } finally {
          await c.query('rollback')
        }
      }
    })
  })
})
