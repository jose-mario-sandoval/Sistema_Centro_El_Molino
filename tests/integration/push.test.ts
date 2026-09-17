import { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { exigirBaseLocal } from '../soporte/entorno-local'
import { asegurarUsuariosPrueba, clienteAdminPrueba, clienteComo, type ClaveUsuario } from '../soporte/usuarios-prueba'

const admin = clienteAdminPrueba()
const PREFIJO = 'https://push.prueba.test/'
let ids: Record<ClaveUsuario, string>

function suscripcion(usuarioId: string, sufijo: string) {
  return {
    usuario_id: usuarioId,
    endpoint: `${PREFIJO}${sufijo}`,
    p256dh: `clave-${sufijo}`,
    auth: `auth-${sufijo}`,
  }
}

/** Conexión directa a la base temporal de CI (Vault y cron no están expuestos por la API). */
async function conPostgres<T>(fn: (cliente: Client) => Promise<T>): Promise<T> {
  exigirBaseLocal()
  const url = process.env.SUPABASE_DB_URL ?? ''
  if (!/@(127\.0\.0\.1|localhost):\d+\//.test(url)) {
    throw new Error('SUPABASE_DB_URL debe apuntar a la base temporal de CI (127.0.0.1 o localhost).')
  }
  const cliente = new Client({ connectionString: url })
  await cliente.connect()
  try {
    return await fn(cliente)
  } finally {
    await cliente.end()
  }
}

async function borrarSecretosVault() {
  await conPostgres((c) => c.query("delete from vault.secrets where name in ('url_app', 'cron_secret')"))
}

async function llamarRecordatorios(): Promise<string | null> {
  const { rows } = await conPostgres((c) =>
    c.query<{ id: string | null }>('select public.llamar_recordatorios() as id'),
  )
  return rows[0].id
}

beforeAll(async () => {
  ids = await asegurarUsuariosPrueba()
})

beforeEach(async () => {
  await admin.from('suscripciones_push').delete().like('endpoint', `${PREFIJO}%`)
  await admin.from('avisos_enviados').delete().gte('fecha', '2000-01-01')
})

afterEach(async () => {
  await asegurarUsuariosPrueba()
})

afterAll(async () => {
  await admin.from('suscripciones_push').delete().like('endpoint', `${PREFIJO}%`)
  await admin.from('avisos_enviados').delete().gte('fecha', '2000-01-01')
  await borrarSecretosVault()
})

describe('suscripciones_push: RLS', () => {
  it('cada usuario registra y ve solo sus suscripciones', async () => {
    const residente = await clienteComo('residente')
    const { error } = await residente.from('suscripciones_push').insert(suscripcion(ids.residente, 'propia'))
    expect(error).toBeNull()
    await admin.from('suscripciones_push').insert(suscripcion(ids.residente2, 'ajena'))

    const { data } = await residente.from('suscripciones_push').select('endpoint')
    expect(data).toEqual([{ endpoint: `${PREFIJO}propia` }])
  })

  it('no se puede registrar una suscripción a nombre de otra persona', async () => {
    const residente = await clienteComo('residente')
    const { error } = await residente.from('suscripciones_push').insert(suscripcion(ids.residente2, 'suplantada'))
    expect(error).not.toBeNull()
  })

  it('no se pueden borrar suscripciones ajenas', async () => {
    await admin.from('suscripciones_push').insert(suscripcion(ids.residente2, 'ajena'))
    const residente = await clienteComo('residente')
    await residente.from('suscripciones_push').delete().eq('endpoint', `${PREFIJO}ajena`)

    const { data } = await admin.from('suscripciones_push').select('id').eq('endpoint', `${PREFIJO}ajena`)
    expect(data).toHaveLength(1)
  })

  it('cada usuario puede borrar las propias', async () => {
    const residente = await clienteComo('residente')
    await residente.from('suscripciones_push').insert(suscripcion(ids.residente, 'propia'))
    const { error } = await residente.from('suscripciones_push').delete().eq('endpoint', `${PREFIJO}propia`)
    expect(error).toBeNull()

    const { data } = await admin.from('suscripciones_push').select('id').eq('endpoint', `${PREFIJO}propia`)
    expect(data).toEqual([])
  })

  it('un usuario inactivo no puede registrar suscripciones', async () => {
    await admin.from('perfiles').update({ activo: false }).eq('id', ids.residente2)
    const inactivo = await clienteComo('residente2')
    const { error } = await inactivo.from('suscripciones_push').insert(suscripcion(ids.residente2, 'inactivo'))
    expect(error).not.toBeNull()
  })

  it('el endpoint es único entre todas las cuentas', async () => {
    await admin.from('suscripciones_push').insert(suscripcion(ids.residente, 'compartido'))
    const { error } = await admin.from('suscripciones_push').insert(suscripcion(ids.residente2, 'compartido'))
    expect(error?.code).toBe('23505')
  })

  it('upsert por endpoint reasigna el dispositivo a otra cuenta', async () => {
    await admin.from('suscripciones_push').insert(suscripcion(ids.residente, 'compartido'))
    const { error } = await admin
      .from('suscripciones_push')
      .upsert(suscripcion(ids.director, 'compartido'), { onConflict: 'endpoint' })
    expect(error).toBeNull()

    const { data } = await admin.from('suscripciones_push').select('usuario_id').eq('endpoint', `${PREFIJO}compartido`)
    expect(data).toEqual([{ usuario_id: ids.director }])
  })

  it('rechaza endpoints que no son https', async () => {
    const { error } = await admin
      .from('suscripciones_push')
      .insert({ ...suscripcion(ids.residente, 'x'), endpoint: 'http://push.prueba.test/x' })
    expect(error?.code).toBe('23514')
  })
})

describe('avisos_enviados', () => {
  it('con sesión no se puede leer ni escribir', async () => {
    await admin.from('avisos_enviados').insert({ fecha: '2026-09-16', comida: 'almuerzo' })
    const director = await clienteComo('director')

    const { data } = await director.from('avisos_enviados').select('fecha')
    expect(data ?? []).toEqual([])

    const { error } = await director.from('avisos_enviados').insert({ fecha: '2026-09-17', comida: 'cena' })
    expect(error).not.toBeNull()
  })

  it('una misma comida se registra una sola vez', async () => {
    const primero = await admin.from('avisos_enviados').insert({ fecha: '2026-09-16', comida: 'cena' })
    expect(primero.error).toBeNull()
    const segundo = await admin.from('avisos_enviados').insert({ fecha: '2026-09-16', comida: 'cena' })
    expect(segundo.error?.code).toBe('23505')
  })
})

describe('llamar_recordatorios', () => {
  it('no se puede ejecutar con sesión de usuario', async () => {
    const director = await clienteComo('director')
    const { error } = await director.rpc('llamar_recordatorios')
    expect(error).not.toBeNull()
  })

  it('sin secretos en Vault no hace nada y no falla', async () => {
    await borrarSecretosVault()
    expect(await llamarRecordatorios()).toBeNull()
  })

  it('con secretos en Vault encola el POST a la app', async () => {
    await conPostgres(async (c) => {
      await c.query("select vault.create_secret('http://127.0.0.1:9', 'url_app')")
      await c.query("select vault.create_secret('secreto-de-prueba', 'cron_secret')")
    })
    try {
      expect(await llamarRecordatorios()).not.toBeNull()
    } finally {
      await borrarSecretosVault()
    }
  })

  it('pg_cron la ejecuta cada 5 minutos', async () => {
    const { rows } = await conPostgres((c) =>
      c.query<{ schedule: string; command: string; active: boolean }>(
        "select schedule, command, active from cron.job where jobname = 'recordatorios-hora-limite'",
      ),
    )
    expect(rows).toEqual([{ schedule: '*/5 * * * *', command: 'select public.llamar_recordatorios()', active: true }])
  })
})

describe('historial de pg_cron', () => {
  it('un job diario borra las corridas de más de 7 días', async () => {
    const { rows } = await conPostgres((c) =>
      c.query<{ schedule: string; command: string; active: boolean }>(
        "select schedule, command, active from cron.job where jobname = 'limpiar-historial-cron'",
      ),
    )
    expect(rows).toEqual([
      {
        schedule: '15 3 * * *',
        command: "delete from cron.job_run_details where end_time < now() - interval '7 days'",
        active: true,
      },
    ])

    // El comando es SQL válido y se puede ejecutar; ROLLBACK para no tocar el historial.
    await conPostgres(async (c) => {
      await c.query('begin')
      try {
        await c.query(rows[0].command)
      } finally {
        await c.query('rollback')
      }
    })
  })
})
