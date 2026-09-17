import { expect, test, type Page } from '@playwright/test'
import { fechaISOEn } from '../../lib/fechas'
import {
  asegurarUsuariosPrueba,
  clienteAdminPrueba,
  CONTRASENA_PRUEBA,
  USUARIOS_PRUEBA,
  type ClaveUsuario,
} from '../soporte/usuarios-prueba'

async function iniciarSesion(page: Page, clave: ClaveUsuario) {
  await page.goto('/login')
  await page.getByLabel('Correo').fill(USUARIOS_PRUEBA[clave].correo)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
}

test.afterEach(async () => {
  const ids = await asegurarUsuariosPrueba()
  const { error } = await clienteAdminPrueba().from('eventos').delete().in('creado_por', Object.values(ids))
  if (error) throw error
})

test('el Director crea, edita y elimina un evento', async ({ page }) => {
  const hoy = fechaISOEn(new Date())
  const celdaHoy = page.locator(`.cal-day[data-fecha="${hoy}"]`)

  await iniciarSesion(page, 'director')
  await page.goto('/calendario')
  await expect(page.getByText('Tocá un día para agregar, editar o eliminar eventos.')).toBeVisible()
  await expect(celdaHoy).toHaveClass(/\btoday\b/)

  await celdaHoy.click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByText('No hay eventos este día.')).toBeVisible()

  // Crear
  await modal.getByLabel('Título del evento').fill('Charla de prueba')
  await modal.getByLabel('Hora (opcional)').fill('19:30')
  await modal.getByRole('button', { name: 'Agregar evento' }).click()
  await expect(modal.getByText('Charla de prueba')).toBeVisible()
  await expect(celdaHoy.locator('.cal-event')).toHaveText('19:30 Charla de prueba')

  // Editar
  await modal.getByRole('button', { name: 'Editar', exact: true }).click()
  await modal.getByLabel('Título del evento').fill('Charla editada')
  await modal.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(modal.getByText('Charla editada')).toBeVisible()
  await expect(modal.getByText('Charla de prueba')).toHaveCount(0)
  await expect(celdaHoy.locator('.cal-event')).toHaveText('19:30 Charla editada')

  // Eliminar (con confirmación)
  await modal.getByRole('button', { name: 'Eliminar', exact: true }).click()
  await modal.getByRole('button', { name: 'Sí, eliminar' }).click()
  await expect(modal.getByText('No hay eventos este día.')).toBeVisible()
  await expect(celdaHoy.locator('.cal-event')).toHaveCount(0)

  const { data } = await clienteAdminPrueba().from('eventos').select('id').eq('fecha', hoy)
  expect(data).toEqual([])
})

test('un Residente ve los eventos del día pero no puede modificarlos', async ({ page }) => {
  const ids = await asegurarUsuariosPrueba()
  const hoy = fechaISOEn(new Date())
  const { error } = await clienteAdminPrueba()
    .from('eventos')
    .insert({ titulo: 'Retiro de prueba', fecha: hoy, hora: '08:00', creado_por: ids.director })
  expect(error).toBeNull()

  await iniciarSesion(page, 'residente')
  await page.goto('/calendario')
  await expect(page.getByText('Vista de solo lectura de los eventos de la casa.')).toBeVisible()

  await page.locator(`.cal-day[data-fecha="${hoy}"]`).click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByText('Retiro de prueba')).toBeVisible()
  await expect(modal.getByText('08:00')).toBeVisible()

  await expect(modal.getByLabel('Título del evento')).toHaveCount(0)
  await expect(modal.getByRole('button', { name: 'Agregar evento' })).toHaveCount(0)
  await expect(modal.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0)
  await expect(modal.getByRole('button', { name: 'Eliminar', exact: true })).toHaveCount(0)

  await modal.getByRole('button', { name: 'Cerrar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
