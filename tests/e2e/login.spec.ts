import { expect, test } from '@playwright/test'
import { asegurarUsuariosPrueba, clienteAdminPrueba, CONTRASENA_PRUEBA, USUARIOS_PRUEBA } from '../soporte/usuarios-prueba'

test.afterEach(async () => {
  await asegurarUsuariosPrueba()
})

test('un residente inicia sesión y ve su nombre', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Correo').fill(USUARIOS_PRUEBA.residente.correo)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
  await expect(page.locator('.sidebar')).toContainText('Residente Prueba')
  await expect(page.locator('.sidebar')).toContainText('Residente')
})

test('contraseña incorrecta muestra un error', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Correo').fill(USUARIOS_PRUEBA.residente.correo)
  await page.getByLabel('Contraseña').fill('incorrecta-123')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  // No usar getByRole('alert'): Next.js agrega su propio anunciador de rutas con ese rol.
  await expect(page.getByText('Correo o contraseña incorrectos.')).toBeVisible()
})

test('una contraseña temporal obliga a elegir una nueva', async ({ page }) => {
  const admin = clienteAdminPrueba()
  const { data } = await admin.from('perfiles').select('id').eq('correo', USUARIOS_PRUEBA.residente2.correo).single()
  await admin.from('perfiles').update({ debe_cambiar_contrasena: true }).eq('id', data!.id)

  await page.goto('/login')
  await page.getByLabel('Correo').fill(USUARIOS_PRUEBA.residente2.correo)
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
  await page.getByLabel('Correo').fill(USUARIOS_PRUEBA.administracion.correo)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/calendario')
  await expect(page).toHaveURL(/\/login$/)
})
