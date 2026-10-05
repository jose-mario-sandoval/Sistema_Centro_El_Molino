import { devices, expect, test, type Page } from '@playwright/test'
import { clienteAdminPrueba, CONTRASENA_PRUEBA, USUARIOS_PRUEBA, type ClaveUsuario } from '../soporte/usuarios-prueba'

/*
 * La invitación a instalar la app (plan 2026-09-29) y las preferencias de avisos por rol. El envío
 * push en sí se prueba en unitarias (lib/push): acá no sale nada hacia un servicio push.
 */

async function iniciarSesion(page: Page, clave: ClaveUsuario) {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(USUARIOS_PRUEBA[clave].usuario)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
}

/** El navegador ofrece instalar: `beforeinstallprompt` sintético, con `prompt()` espiado. */
async function ofrecerInstalacion(page: Page, outcome: 'accepted' | 'dismissed') {
  await page.evaluate((resultado) => {
    const evento = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(evento, {
      prompt: () => {
        ;(window as unknown as { __promptLlamado: number }).__promptLlamado =
          ((window as unknown as { __promptLlamado?: number }).__promptLlamado ?? 0) + 1
        return Promise.resolve()
      },
      userChoice: Promise.resolve({ outcome: resultado, platform: 'web' }),
    })
    window.dispatchEvent(evento)
  }, outcome)
}

const franjaDe = (page: Page) => page.locator('.invitacion-instalar')

/**
 * iPhone y Pixel con Chromium (el único navegador de CI): sin defaultBrowserType, que en un
 * describe obligaría a otro worker (y el iPhone, a WebKit). Tamaño, User-Agent y pantalla táctil.
 */
function enChromium(aparato: (typeof devices)[string]) {
  const { defaultBrowserType, ...resto } = aparato
  void defaultBrowserType
  return resto
}
const IPHONE = enChromium(devices['iPhone 13'])
const ANDROID = enChromium(devices['Pixel 7'])

test.describe('invitación a instalar: teléfono Android', () => {
  test.use(ANDROID)

  // Si el Chromium de la prueba llegara a ofrecer instalar de verdad (un evento del navegador,
  // isTrusted), se ignora: las pruebas mandan el suyo cuando lo necesitan.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      window.addEventListener(
        'beforeinstallprompt',
        (evento) => {
          if (evento.isTrusted) evento.stopImmediatePropagation()
        },
        true,
      ),
    )
  })

  test('aparece arriba, "Instalar" abre el diálogo del navegador y, al instalarse, dice "Listo"', async ({ page }) => {
    await iniciarSesion(page, 'residente')
    const franja = page.getByRole('region', { name: 'Instalá El Molino en tu teléfono' })
    await expect(franja).toBeVisible()
    await expect(franja.getByText('Queda como una app, con su ícono, y te llegan los avisos.')).toBeVisible()

    await ofrecerInstalacion(page, 'accepted')
    const instalar = franja.getByRole('button', { name: 'Instalar' })
    // Con el evento, "Instalar" ya no despliega pasos: llama al diálogo del navegador.
    await expect(instalar).not.toHaveAttribute('aria-expanded')
    await instalar.click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __promptLlamado?: number }).__promptLlamado)).toBe(1)

    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
    await expect(franjaDe(page).getByText('Listo: la app quedó instalada')).toBeVisible()
    await franjaDe(page).getByRole('button', { name: 'Entendido' }).click()
    await expect(franjaDe(page)).toBeHidden()

    // Quedó anotada en el dispositivo: no vuelve a ofrecerla.
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(franjaDe(page)).toBeHidden()

    // La desinstalan: Chrome vuelve a ofrecer instalar, y la franja vuelve en la misma carga.
    await ofrecerInstalacion(page, 'dismissed')
    await expect(franja).toBeVisible()
    await expect(franja.getByRole('button', { name: 'Instalar' })).not.toHaveAttribute('aria-expanded')
    expect(await page.evaluate(() => localStorage.getItem('molino-instalada'))).toBeNull()
  })

  test('sin el evento del navegador, "Instalar" despliega las instrucciones del menú', async ({ page }) => {
    await iniciarSesion(page, 'residente')
    const instalar = franjaDe(page).getByRole('button', { name: 'Instalar' })
    await expect(instalar).toHaveAttribute('aria-expanded', 'false')
    await instalar.click()
    await expect(franjaDe(page).getByText('Abrí el menú del navegador')).toBeVisible()
    await expect(franjaDe(page).getByRole('button', { name: 'Ocultar los pasos' })).toHaveAttribute('aria-expanded', 'true')
  })

  test('"Ahora no" la oculta y sigue oculta después de recargar; en Ajustes queda para instalarla', async ({ page }) => {
    await iniciarSesion(page, 'residente')
    await expect(franjaDe(page)).toBeVisible()
    await franjaDe(page).getByRole('button', { name: 'Ahora no' }).click()
    await expect(franjaDe(page)).toBeHidden()

    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(franjaDe(page)).toBeHidden()

    await page.goto('/configuraciones')
    await expect(page.getByText('Instalar la app', { exact: true })).toBeVisible()
    await expect(franjaDe(page)).toBeHidden()
  })
})

test.describe('invitación a instalar: iPhone', () => {
  test.use(IPHONE)

  test('"Instalar" despliega en el lugar los tres pasos, con la nota de iOS 16.4', async ({ page }) => {
    await iniciarSesion(page, 'residente')
    const franja = page.getByRole('region', { name: 'Instalá El Molino en tu teléfono' })
    await expect(franja).toBeVisible()
    await franja.getByRole('button', { name: 'Instalar' }).click()

    const pasos = franja.getByRole('listitem')
    await expect(pasos).toHaveCount(3)
    await expect(pasos.nth(0)).toContainText('Tocá el botón Compartir')
    await expect(pasos.nth(0)).toContainText('Está abajo, en la barra de Safari.')
    await expect(pasos.nth(1)).toContainText('Elegí «Agregar a pantalla de inicio»')
    await expect(pasos.nth(2)).toContainText('Abrí El Molino desde el ícono nuevo')
    await expect(franja.getByText('Requiere iOS 16.4 o posterior para los avisos.')).toBeVisible()
    // En el lugar, no en un modal.
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('"Ya la instalé" (Safari no puede saberlo) la oculta, también después de recargar', async ({ page }) => {
    await iniciarSesion(page, 'residente')
    await expect(page.getByRole('button', { name: 'Ya la instalé' })).toHaveCount(0)
    await franjaDe(page).getByRole('button', { name: 'Instalar' }).click()
    await franjaDe(page).getByRole('button', { name: 'Ya la instalé' }).click()
    await expect(franjaDe(page)).toBeHidden()
    expect(Number(await page.evaluate(() => localStorage.getItem('molino-ya-la-instale')))).toBeGreaterThan(0)

    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(franjaDe(page)).toBeHidden()
  })
})

test.describe('invitación a instalar: computadora', () => {
  test('nunca aparece en escritorio, aunque el navegador ofrezca instalar', async ({ page }) => {
    await iniciarSesion(page, 'residente')
    await ofrecerInstalacion(page, 'accepted')
    await expect(franjaDe(page)).toHaveCount(0)
    await expect(page.locator('.invitacion-avisos')).toHaveCount(0)

    await page.goto('/configuraciones')
    await expect(page.getByText('Notificaciones en este dispositivo', { exact: true })).toBeVisible()
    await expect(page.getByText('Instalar la app', { exact: true })).toHaveCount(0)
  })
})

test.describe('Ajustes: qué avisos recibir, según el rol', () => {
  test.afterEach(async () => {
    const admin = clienteAdminPrueba()
    await admin
      .from('perfiles')
      .update({ avisar_mensajes: true, avisar_hora_limite: true, avisar_cambios: true, avisar_cocina: true })
      .in('usuario', [USUARIOS_PRUEBA.residente.usuario, USUARIOS_PRUEBA.administracion.usuario])
  })

  test('Residente: los cambios del Director en sus comidas, y lo guardado persiste', async ({ page }) => {
    await iniciarSesion(page, 'residente')
    await page.goto('/configuraciones')
    await expect(page.getByLabel('Mensajes nuevos')).toBeChecked()
    await expect(page.getByLabel('Recordatorio de hora límite')).toBeChecked()
    await expect(page.getByLabel('Cambios para la cocina')).toHaveCount(0)

    const cambios = page.getByLabel('Cambios que hace el Director en mis comidas')
    await expect(cambios).toBeChecked()
    await cambios.uncheck()
    await expect(page.getByText('Preferencias guardadas')).toBeVisible()

    await page.reload()
    await expect(page.getByLabel('Cambios que hace el Director en mis comidas')).not.toBeChecked()
    await expect(page.getByLabel('Mensajes nuevos')).toBeChecked()
  })

  test('Administración: los cambios para la cocina; ni recordatorios ni cambios del Director', async ({ page }) => {
    await iniciarSesion(page, 'administracion')
    await page.goto('/configuraciones')
    await expect(page.getByLabel('Mensajes nuevos')).toBeChecked()
    await expect(page.getByLabel('Recordatorio de hora límite')).toHaveCount(0)
    await expect(page.getByLabel(/Cambios que hace/)).toHaveCount(0)

    const cocina = page.getByLabel('Cambios para la cocina')
    await expect(cocina).toBeChecked()
    await cocina.uncheck()
    await expect(page.getByText('Preferencias guardadas')).toBeVisible()

    await page.reload()
    await expect(page.getByLabel('Cambios para la cocina')).not.toBeChecked()
  })
})
