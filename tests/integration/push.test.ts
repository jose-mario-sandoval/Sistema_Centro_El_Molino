import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
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

describe('avisos de mensajes: reserva durable por evento y dispositivo', () => {
  const mensajesCreados: string[] = []

  afterEach(async () => {
    if (mensajesCreados.length > 0) await admin.from('mensajes').delete().in('id', mensajesCreados.splice(0))
    const preferencias = await admin.from('perfiles').update({ avisar_mensajes: true }).eq('id', ids.administracion)
    if (preferencias.error) throw preferencias.error
  })

  async function publicar(clave: ClaveUsuario, privado = false, padreId?: string) {
    const id = randomUUID()
    mensajesCreados.push(id)
    const cliente = await clienteComo(clave)
    const creado = await cliente.from('mensajes').insert({
      id, autor_id: ids[clave], texto: 'Prueba de notificación', solo_director: privado,
      padre_id: padreId ?? null, aviso_revision: 99,
    })
    expect(creado.error).toBeNull()
    const director = await clienteComo('director')
    const aprobado = await director.from('mensajes').update({ estado: 'aprobado' }).eq('id', id)
    expect(aprobado.error).toBeNull()
    const { data, error } = await admin.from('mensajes').select('aviso_revision').eq('id', id).single()
    expect(error).toBeNull()
    return { id, revision: data!.aviso_revision }
  }

  async function dispositivo(clave: ClaveUsuario, sufijo: string = clave) {
    const { data, error } = await admin.from('suscripciones_push')
      .insert(suscripcion(ids[clave], `mensaje-${sufijo}`)).select('id').single()
    expect(error).toBeNull()
    return data!.id
  }

  function reservar(mensaje: { id: string; revision: number }, dispositivos: string[], tipo = 'publicacion') {
    return admin.rpc('reservar_avisos_mensaje', {
      p_mensaje_id: mensaje.id, p_revision: mensaje.revision, p_tipo: tipo, p_suscripciones: dispositivos,
    })
  }

  it('dos procesos concurrentes reservan el dispositivo una sola vez y no admiten repetir el evento', async () => {
    const mensaje = await publicar('director')
    expect(mensaje.revision).toBe(1) // la revisión enviada por el cliente no se acepta
    const destino = await dispositivo('residente')
    const resultados = await Promise.all([reservar(mensaje, [destino]), reservar(mensaje, [destino])])
    for (const r of resultados) expect(r.error).toBeNull()
    expect(resultados.flatMap((r) => r.data ?? [])).toEqual([destino])
    expect((await reservar(mensaje, [destino])).data).toEqual([])
  })

  it('rechaza un evento viejo, conserva la deduplicación al fijar y permite una nueva revisión de contenido', async () => {
    const mensaje = await publicar('director')
    const destino = await dispositivo('residente')
    expect((await reservar(mensaje, [destino])).data).toEqual([destino])
    const director = await clienteComo('director')
    expect((await director.rpc('fijar_mensaje', { p_id: mensaje.id, p_hasta: null as unknown as string })).error).toBeNull()
    expect((await reservar(mensaje, [destino])).data).toEqual([])
    expect((await director.from('mensajes').update({ texto: 'Contenido corregido' }).eq('id', mensaje.id)).error).toBeNull()
    const { data } = await admin.from('mensajes').select('aviso_revision').eq('id', mensaje.id).single()
    expect(data!.aviso_revision).toBe(mensaje.revision + 1)
    expect((await reservar(mensaje, [destino])).data).toEqual([])
    expect((await reservar({ id: mensaje.id, revision: data!.aviso_revision }, [destino])).data).toEqual([destino])
  })

  it('un privado excluye al autor, a Residentes ajenos y a quienes apagaron los avisos', async () => {
    const mensaje = await publicar('residente', true)
    const [propio, ajeno, director, cocina] = await Promise.all([
      dispositivo('residente'), dispositivo('residente2'), dispositivo('director'), dispositivo('administracion'),
    ])
    expect((await admin.from('perfiles').update({ avisar_mensajes: false }).eq('id', ids.administracion)).error).toBeNull()
    const resultado = await reservar(mensaje, [propio, ajeno, director, cocina])
    expect(resultado.error).toBeNull()
    expect(resultado.data).toEqual([director])
  })

  it('una respuesta privada llega al autor del hilo; el padre pendiente bloquea cualquier aviso público', async () => {
    const padre = await publicar('residente', true)
    const respuesta = await publicar('administracion', true, padre.id)
    const [autorHilo, ajeno, autorRespuesta] = await Promise.all([
      dispositivo('residente'), dispositivo('residente2'), dispositivo('administracion'),
    ])
    expect((await reservar(respuesta, [autorHilo, ajeno, autorRespuesta], 'respuesta')).data).toEqual([autorHilo])
    const director = await clienteComo('director')
    expect((await director.from('mensajes').update({ estado: 'pendiente' }).eq('id', padre.id)).error).toBeNull()
    // Un dispositivo distinto demuestra que no es el registro previo el que bloquea el aviso tardío.
    const nuevo = await dispositivo('residente', 'residente-nuevo')
    expect((await reservar(respuesta, [nuevo], 'respuesta')).data).toEqual([])
  })

  it('solo el servidor puede leer las reservas y ejecutar su función', async () => {
    const mensaje = await publicar('director')
    const destino = await dispositivo('residente')
    const residente = await clienteComo('residente')
    expect((await residente.from('avisos_mensaje_push').select('mensaje_id')).error?.code).toBe('42501')
    expect((await residente.rpc('reservar_avisos_mensaje', {
      p_mensaje_id: mensaje.id, p_revision: mensaje.revision, p_tipo: 'publicacion', p_suscripciones: [destino],
    })).error?.code).toBe('42501')
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
        command:
          "delete from cron.job_run_details where coalesce(end_time, start_time) < now() - interval '7 days'",
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

describe('preferencias de avisos: cambios del Director y cocina', () => {
  it('avisar_cambios y avisar_cocina existen, no admiten nulo y valen true por defecto', async () => {
    const { rows } = await conPostgres((c) =>
      c.query<{ column_name: string; is_nullable: string; column_default: string }>(
        `select column_name, is_nullable, column_default from information_schema.columns
          where table_schema = 'public' and table_name = 'perfiles'
            and column_name in ('avisar_cambios', 'avisar_cocina')
          order by column_name`,
      ),
    )
    expect(rows).toEqual([
      { column_name: 'avisar_cambios', is_nullable: 'NO', column_default: 'true' },
      { column_name: 'avisar_cocina', is_nullable: 'NO', column_default: 'true' },
    ])
  })

  it('con sesión nadie las cambia directo, ni las propias ni las de otra persona (solo el servidor)', async () => {
    const residente = await clienteComo('residente')
    const propia = await residente.from('perfiles').update({ avisar_cambios: false }).eq('id', ids.residente).select('id')
    expect(propia.error?.code).toBe('42501')

    const administracion = await clienteComo('administracion')
    const ajena = await administracion
      .from('perfiles')
      .update({ avisar_cocina: false, avisar_cambios: false })
      .eq('id', ids.residente)
      .select('id')
    expect(ajena.error?.code).toBe('42501')

    const { data } = await admin.from('perfiles').select('avisar_cambios, avisar_cocina').eq('id', ids.residente).single()
    expect(data).toEqual({ avisar_cambios: true, avisar_cocina: true })
  })
})
