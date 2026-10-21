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
  const configuracion = page.getByRole('region', { name: 'Donaciones', exact: true })
  await expect(configuracion).toContainText('Todavía no hay una donación configurada')
  await configuracion.getByLabel('Monto mensual de donación en dólares').fill('123.29')
  await configuracion.getByLabel('Mes de inicio de donación').selectOption(String(Number(actual.slice(5, 7))))
  await configuracion.getByLabel('Año de inicio de donación').fill(actual.slice(0, 4))
  await configuracion.getByRole('button', { name: 'Guardar donación', exact: true }).click()
  await expect(configuracion).toContainText('Donación vigente: $123.29 al mes.')
  await esperarSinScrollLateral(page)
  await page.goto('/pensiones/marcar')
  const mes = page.getByRole('region', { name: `Donación de ${etiquetaPeriodo(actual)}`, exact: true })
  await expect(mes).toContainText('Pendiente de recibir')
  await esperarAltoMinimo(mes.getByRole('button'))
  await esperarSinScrollLateral(page)
  const contexto = await browser.newContext({ baseURL })
  try {
    const segundo = await contexto.newPage()
    await iniciarSesion(segundo, 'director2')
    await segundo.goto('/pensiones/marcar')
    const otroMes = segundo.getByRole('region', { name: `Donación de ${etiquetaPeriodo(actual)}`, exact: true })
    await expect(otroMes).toContainText('Pendiente de recibir')
    await mes.getByRole('button', { name: 'Donación recibida', exact: true }).click()
    const confirmacion = page.getByRole('region', { name: 'Confirmar donación', exact: true })
    await expect(confirmacion).toContainText('$123.29')
    await confirmacion.getByRole('button', { name: 'Confirmar donación recibida', exact: true }).click()
    await expect(mes).toContainText('Recibida')
    await expect(otroMes).toContainText('Recibida', { timeout: 40_000 })
    await expect(otroMes.getByRole('button')).toHaveCount(0)
    const { data, error } = await admin.from('pensiones_donaciones_recepciones').select('*').eq('periodo', actual)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0].monto_centavos).toBe(12329)
  } finally { await contexto.close() }
})

test('Residente no recibe el bloque ni los controles de donación', async ({ page }) => {
  await iniciarSesion(page, 'residente')
  await page.goto('/pensiones/marcar')
  await expect(page.getByRole('region', { name: 'Donación', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Donación recibida', exact: true })).toHaveCount(0)
  await page.goto('/pensiones/editar')
  await expect(page).toHaveURL(/\/comidas\/semana$/)
})
