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
  await modal.getByLabel('Charla o formación').check()
  await modal.getByLabel('Hora (opcional)').fill('19:30')
  await modal.getByRole('button', { name: 'Agregar evento' }).click()
  await expect(modal.getByText('Charla de prueba')).toBeVisible()
  await expect(celdaHoy.locator('.cal-event')).toHaveText('19:30 Charla de prueba')

  // Editar: el foco entra al título
  await modal.getByRole('button', { name: 'Editar Charla de prueba', exact: true }).click()
  await expect(modal.getByLabel('Título del evento')).toBeFocused()
  await modal.getByLabel('Título del evento').fill('Charla editada')
  await modal.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(modal.getByText('Charla editada')).toBeVisible()
  await expect(modal.getByText('Charla de prueba')).toHaveCount(0)
  await expect(celdaHoy.locator('.cal-event')).toHaveText('19:30 Charla editada')
  await expect(modal).toBeFocused()

  // Eliminar (con confirmación): el foco va a "Cancelar", la opción segura
  await modal.getByRole('button', { name: 'Eliminar Charla editada', exact: true }).click()
  await expect(modal.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await modal.getByRole('button', { name: 'Sí, eliminar' }).click()
  await expect(modal.getByText('No hay eventos este día.')).toBeVisible()
  await expect(modal).toBeFocused()
  await expect(celdaHoy.locator('.cal-event')).toHaveCount(0)

  const { data } = await clienteAdminPrueba().from('eventos').select('id').eq('fecha', hoy)
  expect(data).toEqual([])
})

test('si guardar la edición falla, el formulario conserva lo escrito y no se guarda nada', async ({ page }) => {
  const ids = await asegurarUsuariosPrueba()
  const hoy = fechaISOEn(new Date())
  const { data: evento, error } = await clienteAdminPrueba()
    .from('eventos')
    .insert({ titulo: 'Título original', fecha: hoy, hora: '10:00', creado_por: ids.director })
    .select('id')
    .single()
  expect(error).toBeNull()

  await iniciarSesion(page, 'director')
  await page.goto('/calendario')
  await page.locator(`.cal-day[data-fecha="${hoy}"]`).click()
  const modal = page.getByRole('dialog')
  await modal.getByRole('button', { name: 'Editar Título original', exact: true }).click()
  await modal.getByLabel('Título del evento').fill('Título que no llega')
  await modal.getByLabel('Hora (opcional)').fill('11:45')

  // Simula una caída de red: la Server Action es un POST a la misma página.
  await page.route(
    (url) => url.pathname === '/calendario',
    (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()),
  )
  await modal.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('No se pudo guardar el evento. Revisá tu conexión e intentá de nuevo.')).toBeVisible()

  await expect(modal.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
  await expect(modal.getByLabel('Título del evento')).toHaveValue('Título que no llega')
  await expect(modal.getByLabel('Hora (opcional)')).toHaveValue('11:45')

  const { data } = await clienteAdminPrueba().from('eventos').select('titulo, hora').eq('id', evento!.id).single()
  expect(data).toEqual({ titulo: 'Título original', hora: '10:00:00' })
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
  await expect(modal.getByRole('button', { name: /^Editar/ })).toHaveCount(0)
  await expect(modal.getByRole('button', { name: /^Eliminar/ })).toHaveCount(0)

  await modal.getByRole('button', { name: 'Cerrar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('el Director elige el tipo y lo que pide a la cocina, y "solo materiales" excluye a lo demás', async ({ page }) => {
  const hoy = fechaISOEn(new Date())
  await iniciarSesion(page, 'director')
  await page.goto('/calendario')
  await page.locator(`.cal-day[data-fecha="${hoy}"]`).click()
  const modal = page.getByRole('dialog')

  const merienda = modal.getByLabel('Merienda', { exact: true })
  const comida = modal.getByLabel('Comida', { exact: true })
  const materiales = modal.getByLabel('Solo materiales de cocina', { exact: true })

  await merienda.check()
  await comida.check()
  await expect(merienda).toBeChecked()
  await expect(comida).toBeChecked()

  // "Solo materiales" va solo: marcarlo desmarca lo demás, y al revés.
  await materiales.check()
  await expect(materiales).toBeChecked()
  await expect(merienda).not.toBeChecked()
  await expect(comida).not.toBeChecked()
  await merienda.check()
  await expect(materiales).not.toBeChecked()

  await modal.getByLabel('Título del evento').fill('Retiro con merienda')
  await modal.getByLabel('Retiro', { exact: true }).check()
  await modal.getByLabel('Hora (opcional)').fill('16:00')
  await modal.getByRole('button', { name: 'Agregar evento' }).click()
  await expect(modal.getByText('Retiro con merienda')).toBeVisible()

  const { data } = await clienteAdminPrueba().from('eventos').select('tipo, requiere_cocina').eq('fecha', hoy).single()
  expect(data).toEqual({ tipo: 'retiro', requiere_cocina: ['merienda'] })
})

test('sin elegir el tipo el evento no se guarda', async ({ page }) => {
  const hoy = fechaISOEn(new Date())
  await iniciarSesion(page, 'director')
  await page.goto('/calendario')
  await page.locator(`.cal-day[data-fecha="${hoy}"]`).click()
  const modal = page.getByRole('dialog')

  await modal.getByLabel('Título del evento').fill('Sin tipo')
  await modal.getByRole('button', { name: 'Agregar evento' }).click()

  // El navegador marca el tipo como faltante y no envía el formulario.
  const faltante = await modal
    .getByLabel('Charla o formación')
    .evaluate((radio) => (radio as HTMLInputElement).validity.valueMissing)
  expect(faltante).toBe(true)
  await expect(modal.getByText('Nuevo evento')).toBeVisible()
  const { data } = await clienteAdminPrueba().from('eventos').select('id').eq('fecha', hoy)
  expect(data).toEqual([])
})

test('Administración ve lo que la cocina debe preparar, sin título ni tipo', async ({ page }) => {
  const ids = await asegurarUsuariosPrueba()
  const hoy = fechaISOEn(new Date())
  const { error } = await clienteAdminPrueba()
    .from('eventos')
    .insert([
      { titulo: 'Retiro secreto', fecha: hoy, hora: '16:00', tipo: 'retiro', requiere_cocina: ['merienda', 'comida'], creado_por: ids.director },
      { titulo: 'Reunión privada', fecha: hoy, hora: '09:00', tipo: 'reunion', requiere_cocina: [], creado_por: ids.director },
    ])
  expect(error).toBeNull()

  await iniciarSesion(page, 'administracion')
  await page.goto('/calendario')
  await expect(page.getByText('Lo que la casa necesita de la cocina')).toBeVisible()

  await page.locator(`.cal-day[data-fecha="${hoy}"]`).click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByText('Merienda y comida')).toBeVisible()
  await expect(modal.getByText('16:00')).toBeVisible()
  // El evento que no pide nada a la cocina no aparece, ni su hora.
  await expect(modal.getByText('09:00')).toHaveCount(0)

  // Ni el título ni el tipo llegan al navegador, ni en pantalla ni en los datos de la página.
  const html = await page.content()
  for (const secreto of ['Retiro secreto', 'Reunión privada']) {
    expect(html, `"${secreto}" no debería llegar a Administración`).not.toContain(secreto)
  }
  await expect(modal.getByLabel('Título del evento')).toHaveCount(0)
})
