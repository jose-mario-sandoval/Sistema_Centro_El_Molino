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
