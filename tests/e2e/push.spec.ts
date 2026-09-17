import { expect, test, type Page } from '@playwright/test'
import { clienteAdminPrueba, CONTRASENA_PRUEBA, USUARIOS_PRUEBA } from '../soporte/usuarios-prueba'

async function iniciarSesion(page: Page, correo: string) {
  await page.goto('/login')
  await page.getByLabel('Correo').fill(correo)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
}

test.describe('PWA: rutas públicas', () => {
  test('el manifest se sirve sin sesión con el nombre de la app', async ({ request }) => {
    const respuesta = await request.get('/manifest.webmanifest', { maxRedirects: 0 })
    expect(respuesta.status()).toBe(200)
    const manifest = await respuesta.json()
    expect(manifest.name).toBe('Centro El Molino')
    expect(manifest.short_name).toBe('El Molino')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons).toHaveLength(3)
  })

  test('íconos, service worker y página sin conexión se sirven sin sesión', async ({ request }) => {
    for (const ruta of ['/iconos/192', '/iconos/512', '/iconos/maskable-512']) {
      const icono = await request.get(ruta, { maxRedirects: 0 })
      expect(icono.status(), ruta).toBe(200)
      expect(icono.headers()['content-type']).toContain('image/png')
    }

    const sw = await request.get('/sw.js', { maxRedirects: 0 })
    expect(sw.status()).toBe(200)
    expect(sw.headers()['content-type']).toContain('javascript')

    const sinConexion = await request.get('/sin-conexion', { maxRedirects: 0 })
    expect(sinConexion.status()).toBe(200)
    expect(await sinConexion.text()).toContain('Sin conexión')
  })

  test('el ícono de iOS se sirve sin sesión', async ({ page, request }) => {
    await page.goto('/login')
    const href = await page.locator('link[rel="apple-touch-icon"]').first().getAttribute('href')
    expect(href).toBeTruthy()
    const icono = await request.get(href!, { maxRedirects: 0 })
    expect(icono.status()).toBe(200)
    expect(icono.headers()['content-type']).toContain('image/png')
  })
})

test.describe('cron de recordatorios', () => {
  test('rechaza llamadas sin el secreto', async ({ request }) => {
    const sinCabecera = await request.post('/api/cron/recordatorios', { maxRedirects: 0 })
    expect(sinCabecera.status()).toBe(401)

    const incorrecto = await request.post('/api/cron/recordatorios', {
      headers: { Authorization: 'Bearer incorrecto' },
      maxRedirects: 0,
    })
    expect(incorrecto.status()).toBe(401)
  })

  test('acepta el secreto y responde 202', async ({ request }) => {
    test.skip(!process.env.CRON_SECRET, 'Requiere CRON_SECRET (definido en CI)')
    const respuesta = await request.post('/api/cron/recordatorios', {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      maxRedirects: 0,
    })
    expect(respuesta.status()).toBe(202)
    expect(Array.isArray((await respuesta.json()).avisos)).toBe(true)
  })
})

test.describe('/api/push', () => {
  const ENDPOINT_PROPIO = 'https://fcm.googleapis.com/fcm/send/e2e-propio'
  const ENDPOINT_AJENO = 'https://fcm.googleapis.com/fcm/send/e2e-ajeno'
  const ENDPOINT_DESCONOCIDO = 'https://atacante.example/push/e2e'
  const LLAVES = { p256dh: 'p256dh-de-prueba', auth: 'auth-de-prueba' }

  let admin: ReturnType<typeof clienteAdminPrueba>

  test.beforeAll(() => {
    admin = clienteAdminPrueba()
  })

  test.afterEach(async () => {
    await admin
      .from('suscripciones_push')
      .delete()
      .in('endpoint', [ENDPOINT_PROPIO, ENDPOINT_AJENO, ENDPOINT_DESCONOCIDO])
  })

  async function idDe(clave: 'residente' | 'residente2'): Promise<string> {
    const { data } = await admin.from('perfiles').select('id').eq('correo', USUARIOS_PRUEBA[clave].correo).single()
    expect(data, `falta el usuario de prueba ${clave}`).not.toBeNull()
    return data!.id
  }

  /** Dueño actual del dispositivo, o null si la suscripción no existe. */
  async function duenoDe(endpoint: string): Promise<string | null> {
    const { data } = await admin.from('suscripciones_push').select('usuario_id').eq('endpoint', endpoint).maybeSingle()
    return data?.usuario_id ?? null
  }

  test('sin sesión responde 401', async ({ request }) => {
    const alta = await request.post('/api/push', {
      data: { endpoint: ENDPOINT_PROPIO, keys: LLAVES },
      maxRedirects: 0,
    })
    expect(alta.status()).toBe(401)
    expect(await duenoDe(ENDPOINT_PROPIO)).toBeNull()

    const baja = await request.delete('/api/push', { data: { endpoint: ENDPOINT_PROPIO }, maxRedirects: 0 })
    expect(baja.status()).toBe(401)
  })

  test('registra el dispositivo y lo reasigna a la cuenta con sesión', async ({ page }) => {
    const residente = await idDe('residente')
    const residente2 = await idDe('residente2')
    await iniciarSesion(page, USUARIOS_PRUEBA.residente.correo)

    const alta = await page.request.post('/api/push', {
      data: { endpoint: ENDPOINT_PROPIO, keys: LLAVES, expirationTime: null },
      maxRedirects: 0,
    })
    expect(alta.status()).toBe(204)
    expect(await duenoDe(ENDPOINT_PROPIO)).toBe(residente)

    // Dispositivo compartido: quedó a nombre de otra cuenta y esta sesión lo vuelve a tomar.
    await admin.from('suscripciones_push').update({ usuario_id: residente2 }).eq('endpoint', ENDPOINT_PROPIO)
    const reasignacion = await page.request.post('/api/push', {
      data: { endpoint: ENDPOINT_PROPIO, keys: LLAVES },
      maxRedirects: 0,
    })
    expect(reasignacion.status()).toBe(204)
    expect(await duenoDe(ENDPOINT_PROPIO)).toBe(residente)
  })

  test('la baja solo borra la suscripción de la cuenta con sesión', async ({ page }) => {
    const residente = await idDe('residente')
    const residente2 = await idDe('residente2')
    await admin.from('suscripciones_push').insert([
      { usuario_id: residente, endpoint: ENDPOINT_PROPIO, ...LLAVES },
      { usuario_id: residente2, endpoint: ENDPOINT_AJENO, ...LLAVES },
    ])
    await iniciarSesion(page, USUARIOS_PRUEBA.residente.correo)

    const ajena = await page.request.delete('/api/push', { data: { endpoint: ENDPOINT_AJENO }, maxRedirects: 0 })
    expect(ajena.status()).toBe(204)
    expect(await duenoDe(ENDPOINT_AJENO)).toBe(residente2)

    const propia = await page.request.delete('/api/push', { data: { endpoint: ENDPOINT_PROPIO }, maxRedirects: 0 })
    expect(propia.status()).toBe(204)
    expect(await duenoDe(ENDPOINT_PROPIO)).toBeNull()
  })

  test('rechaza endpoints que no son de un servicio push conocido', async ({ page }) => {
    await iniciarSesion(page, USUARIOS_PRUEBA.residente.correo)

    const respuesta = await page.request.post('/api/push', {
      data: { endpoint: ENDPOINT_DESCONOCIDO, keys: LLAVES },
      maxRedirects: 0,
    })
    expect(respuesta.status()).toBe(400)
    expect(await duenoDe(ENDPOINT_DESCONOCIDO)).toBeNull()
  })
})

test.describe('Configuraciones', () => {
  test('muestra la sección de notificaciones y guarda las preferencias', async ({ page }) => {
    const admin = clienteAdminPrueba()
    const correo = USUARIOS_PRUEBA.residente.correo
    try {
      await iniciarSesion(page, correo)
      await page.goto('/configuraciones')

      await expect(page.getByRole('heading', { name: 'Notificaciones', exact: true })).toBeVisible()
      await expect(page.getByText('Notificaciones en este dispositivo', { exact: true })).toBeVisible()
      await expect(page.getByLabel('Recordatorio de hora límite')).toBeChecked()

      const mensajes = page.getByLabel('Mensajes nuevos')
      await expect(mensajes).toBeChecked()
      await mensajes.uncheck()
      await expect(page.getByText('Preferencias guardadas')).toBeVisible()

      await page.reload()
      await expect(page.getByLabel('Mensajes nuevos')).not.toBeChecked()
    } finally {
      await admin.from('perfiles').update({ avisar_mensajes: true, avisar_hora_limite: true }).eq('correo', correo)
    }
  })
})
