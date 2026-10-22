import { expect, test, type Page } from '@playwright/test'
import { etiquetaPeriodo, mesActual } from '../../lib/pensiones/calculos'
import { esperarAltoMinimo, esperarSinScrollLateral } from '../soporte/medidas-e2e'
import { asegurarUsuariosPrueba, clienteAdminPrueba, CONTRASENA_PRUEBA, USUARIOS_PRUEBA, type ClaveUsuario } from '../soporte/usuarios-prueba'

const admin = clienteAdminPrueba()
const actual = mesActual()
async function iniciarSesion(page: Page, clave: ClaveUsuario) {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(USUARIOS_PRUEBA[clave].usuario)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
}
async function limpiar() {
  for (const [tabla, columna] of [['pensiones_donaciones_recepciones', 'periodo'], ['pensiones_donaciones_configuracion', 'desde']]) {
    const { error } = await admin.from(tabla).delete().gte(columna, '2000-01-01')
    if (error) throw error
  }
}
test.beforeEach(async () => { await asegurarUsuariosPrueba(); await limpiar() })
test.afterEach(limpiar)

test('Director configura una donación compartida y ambas sesiones ven una única recepción', async ({ page, browser, baseURL }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 320, height: 900 })
  await iniciarSesion(page, 'director')
  await page.goto('/pensiones/editar')
  await page.evaluate(() => { document.documentElement.dataset.texto = 'enorme'; document.documentElement.dataset.contraste = 'alto' })
  const configuracion = page.getByRole('region', { name: 'Ingresos por donaciones', exact: true })
  await expect(configuracion).toContainText('Todavía no hay un monto de ingresos por donaciones configurado')
  await configuracion.getByLabel('Monto mensual de ingresos por donaciones en dólares').fill('123.29')
  await configuracion.getByLabel('Mes de inicio de ingresos por donaciones').selectOption(String(Number(actual.slice(5, 7))))
  await configuracion.getByLabel('Año de inicio de ingresos por donaciones').fill(actual.slice(0, 4))
  await configuracion.getByRole('button', { name: 'Guardar monto', exact: true }).click()
  await expect(configuracion).toContainText('Monto vigente de ingresos por donaciones: $123.29 al mes.')
  await esperarSinScrollLateral(page)
  await page.goto('/pensiones/marcar')
  await page.evaluate(() => {
    document.documentElement.dataset.texto = 'enorme'
    document.documentElement.dataset.theme = 'dark'
    document.documentElement.dataset.contraste = 'alto'
  })
  const panelDonaciones = page.getByRole('button', { name: /^Ingresos por donaciones/ })
  await expect(panelDonaciones).toHaveAttribute('aria-expanded', 'false')
  await expect(panelDonaciones).toContainText(etiquetaPeriodo(actual))
  await expect(panelDonaciones).toContainText('Pendiente de recibir')
  await esperarAltoMinimo(page.getByRole('button', { name: /^(Mi pensión|Ingresos por donaciones)/ }))
  await esperarSinScrollLateral(page)
  await panelDonaciones.click()
  const mes = page.getByRole('region', { name: `Ingresos por donaciones de ${etiquetaPeriodo(actual)}`, exact: true })
  await expect(mes).toContainText('Pendiente de recibir')
  await esperarAltoMinimo(mes.getByRole('button'))
  await esperarSinScrollLateral(page)
  const contexto = await browser.newContext({ baseURL })
  try {
    const segundo = await contexto.newPage()
    await iniciarSesion(segundo, 'director2')
    await segundo.goto('/pensiones/marcar')
    const otroPanel = segundo.getByRole('button', { name: /^Ingresos por donaciones/ })
    await expect(otroPanel).toHaveAttribute('aria-expanded', 'false')
    await expect(otroPanel).toContainText('Pendiente de recibir')
    await otroPanel.click()
    const otroMes = segundo.getByRole('region', { name: `Ingresos por donaciones de ${etiquetaPeriodo(actual)}`, exact: true })
    await expect(otroMes).toContainText('Pendiente de recibir')
    await otroMes.getByRole('button', { name: 'Registrar recepción', exact: true }).click()
    await otroPanel.click()
    await mes.getByRole('button', { name: 'Registrar recepción', exact: true }).click()
    const confirmacion = page.getByRole('region', { name: 'Confirmar recepción de ingresos por donaciones', exact: true })
    await expect(confirmacion).toContainText('$123.29')
    await panelDonaciones.click()
    await expect(confirmacion).toBeHidden()
    await panelDonaciones.click()
    await expect(confirmacion).toContainText(etiquetaPeriodo(actual))
    await expect(confirmacion).toContainText('$123.29')
    // Abrir, cerrar o revisar no recibe la donación: sigue haciendo falta confirmar.
    const antes = await admin.from('pensiones_donaciones_recepciones').select('periodo').eq('periodo', actual)
    expect(antes.error).toBeNull()
    expect(antes.data).toEqual([])
    await confirmacion.getByRole('button', { name: 'Confirmar recepción', exact: true }).click()
    await expect(mes).toContainText('Recibido')
    await expect(otroPanel).toContainText('Recibido', { timeout: 40_000 })
    await expect(otroPanel).toHaveAttribute('aria-expanded', 'false')
    await otroPanel.click()
    await expect(otroMes).toContainText('Recibido')
    await expect(otroMes.getByRole('button')).toHaveCount(0)
    await expect(segundo.getByRole('region', { name: 'Confirmar recepción de ingresos por donaciones', exact: true })).toHaveCount(0)
    const { data, error } = await admin.from('pensiones_donaciones_recepciones').select('*').eq('periodo', actual)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0].monto_centavos).toBe(12329)
  } finally { await contexto.close() }
})

test('Residente no recibe el bloque ni los controles de donación', async ({ page }) => {
  await iniciarSesion(page, 'residente')
  await page.goto('/pensiones/marcar')
  await expect(page.getByRole('button', { name: /^Mi pensión/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Ingresos por donaciones/ })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Ingresos por donaciones', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Registrar recepción', exact: true })).toHaveCount(0)
  await page.goto('/pensiones/editar')
  await expect(page).toHaveURL(/\/comidas\/semana$/)
})
