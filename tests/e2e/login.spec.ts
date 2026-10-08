import { expect, test, type Page } from '@playwright/test'
import { asegurarUsuariosPrueba, clienteAdminPrueba, CONTRASENA_PRUEBA, USUARIOS_PRUEBA } from '../soporte/usuarios-prueba'

test.afterEach(async () => {
  await asegurarUsuariosPrueba()
})

async function iniciarSesion(page: Page, usuario: string) {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(usuario)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
}

test('un residente inicia sesión y ve su nombre', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Usuario').fill(USUARIOS_PRUEBA.residente.usuario)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
  await expect(page.locator('.sidebar')).toContainText('Residente Prueba')
  await expect(page.locator('.sidebar')).toContainText('Residente')
})

test('contraseña incorrecta muestra un error', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(USUARIOS_PRUEBA.residente.usuario)
  await page.getByLabel('Contraseña').fill('incorrecta-123')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  // No usar getByRole('alert'): Next.js agrega su propio anunciador de rutas con ese rol.
  await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible()
})

test('se entra igual escribiendo el usuario con mayúsculas o el correo de siempre', async ({ page }) => {
  // El correo de siempre: lo de antes de la arroba es el usuario que le tocó a esa cuenta.
  for (const escrito of ['RESIDENTE', 'residente@prueba.test']) {
    await page.goto('/login')
    await page.getByLabel('Usuario').fill(escrito)
    await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page).toHaveURL(/\/comidas\/semana$/)
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/login$/)
  }
})

test('un usuario que no existe recibe el mismo mensaje que una contraseña incorrecta', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill('no.existe.nadie')
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible()
})

test('una contraseña temporal obliga a elegir una nueva', async ({ page }) => {
  const admin = clienteAdminPrueba()
  const { data } = await admin.from('perfiles').select('id').eq('usuario', USUARIOS_PRUEBA.residente2.usuario).single()
  await admin.from('perfiles').update({ debe_cambiar_contrasena: true }).eq('id', data!.id)

  await page.goto('/login')
  await page.getByLabel('Usuario').fill(USUARIOS_PRUEBA.residente2.usuario)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/cambiar-contrasena$/)

  await page.goto('/mensajes')
  await expect(page).toHaveURL(/\/cambiar-contrasena$/)

  await page.getByLabel('Contraseña nueva').fill('nueva-clave-456')
  await page.getByLabel('Repetir contraseña').fill('nueva-clave-456')
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
})

test('cerrar sesión vuelve al login', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(USUARIOS_PRUEBA.administracion.usuario)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/calendario')
  await expect(page).toHaveURL(/\/login$/)
})

test('el usuario se conserva después de un error', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(USUARIOS_PRUEBA.residente.usuario)
  await page.getByLabel('Contraseña').fill('incorrecta-123')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible()
  await expect(page.getByLabel('Usuario')).toHaveValue(USUARIOS_PRUEBA.residente.usuario)
})

test('una cuenta desactivada con sesión abierta termina en el login sin bucle', async ({ page }) => {
  await iniciarSesion(page, USUARIOS_PRUEBA.residente2.usuario)

  // afterEach (asegurarUsuariosPrueba) la vuelve a activar.
  const admin = clienteAdminPrueba()
  const { error } = await admin.from('perfiles').update({ activo: false }).eq('usuario', USUARIOS_PRUEBA.residente2.usuario)
  expect(error).toBeNull()

  await page.goto('/mensajes')
  await expect(page).toHaveURL(/\/login$/)
  await page.waitForTimeout(1_000)
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Centro El Molino' })).toBeVisible()
})

test('cerrar sesión con la sesión ya vencida vuelve al login sin errores', async ({ page, context }) => {
  const erroresDePagina: Error[] = []
  page.on('pageerror', (e) => erroresDePagina.push(e))

  await iniciarSesion(page, USUARIOS_PRUEBA.residente.usuario)
  // Sin cookies la Server Action llega sin sesión: el proxy debe dejarla pasar en vez de redirigir el POST.
  await context.clearCookies()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Centro El Molino' })).toBeVisible()
  await expect(page.getByText('Application error')).toHaveCount(0)
  expect(erroresDePagina).toEqual([])
})
