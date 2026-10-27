import { expect, test, type Page } from '@playwright/test'
import { etiquetaPeriodo, mesActual } from '../../lib/pensiones/calculos'
import {
  asegurarUsuariosPrueba, clienteAdminPrueba, clienteComo, CONTRASENA_PRUEBA,
  USUARIOS_PRUEBA, type ClaveUsuario,
} from '../soporte/usuarios-prueba'

// clienteAdminPrueba y globalSetup solo admiten Supabase temporal local. Playwright
// usa un servidor propio en 3100 y workers: 1; no se escriben datos del proyecto remoto.
const admin = clienteAdminPrueba()
const actual = mesActual()
const anio = Number(actual.slice(0, 4))
const mes = Number(actual.slice(5, 7))
let ids: Record<ClaveUsuario, string>

async function iniciarSesion(page: Page, clave: ClaveUsuario) {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(USUARIOS_PRUEBA[clave].usuario)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
}

async function limpiar() {
  const exencion = await admin.from('pensiones_exencion').delete().eq('unica', true)
  if (exencion.error) throw exencion.error
  for (const tabla of ['pensiones_pagos', 'pensiones_cuotas', 'pensiones_participacion']) {
    const { error } = await admin.from(tabla).delete().in('usuario_id', Object.values(ids))
    if (error) throw error
  }
  for (const [tabla, columna] of [['pensiones_donaciones_recepciones', 'periodo'], ['pensiones_donaciones_configuracion', 'desde']]) {
    const { error } = await admin.from(tabla).delete().gte(columna, '2000-01-01')
    if (error) throw error
  }
}

test.beforeEach(async () => {
  ids = await asegurarUsuariosPrueba()
  await limpiar()
  // Cada prueba define la participación; no depende de lo que dejó integración.
  const participacion = await admin.from('pensiones_participacion').insert(
    (['director', 'director2', 'residente', 'residente2'] as const)
      .map((clave) => ({ usuario_id: ids[clave], desde: actual, incluido: true })),
  )
  if (participacion.error) throw participacion.error
  const director = await clienteComo('director')
  for (const [clave, monto] of [['director2', 50000], ['residente', 30000]] as const) {
    const { error } = await director.rpc('guardar_cuota_pension', {
      p_usuario_id: ids[clave], p_desde: actual, p_categoria: 'profesional', p_monto_centavos: monto,
    })
    if (error) throw error
  }
  const activacion = await admin.rpc('activar_exencion_pension', { p_usuario_id: ids.director2 })
  if (activacion.error) throw activacion.error
  expect(activacion.data).toBe(actual)
})

test.afterEach(async () => {
  if (ids) await limpiar()
  await asegurarUsuariosPrueba()
})

test('Director exento ve $0 sin pago seleccionable y conserva Editar y Donación', async ({ page }) => {
  test.setTimeout(90_000)
  await iniciarSesion(page, 'director2')
  await page.goto(`/pensiones/marcar?anio=${anio}`)
  const pension = page.getByRole('button', { name: /^Mi pensión/ })
  await expect(pension).toHaveAttribute('aria-expanded', 'false')
  await expect(pension).toContainText(etiquetaPeriodo(actual))
  await expect(pension).toContainText('Exento de pensión')
  await expect(pension).toContainText('$0.00')
  await pension.click()
  const mesActual = page.getByRole('region', { name: 'Meses de pensión', exact: true })
    .locator(`.pension-mes:has(input[value="${actual}"])`)
  await expect(mesActual).toContainText('Exento de pensión')
  await expect(mesActual).toContainText('$0.00')
  await expect(mesActual).toContainText('No requiere registrar pagos.')
  await expect(mesActual.locator('input[type="checkbox"]:enabled')).toHaveCount(0)
  await expect(mesActual).not.toContainText('Sin cuota configurada')
  await expect(page.getByRole('button', { name: 'Revisar pagos', exact: true })).toBeDisabled()

  await page.goto('/pensiones/editar')
  const exenta = page.getByRole('region', { name: `Cuota de ${USUARIOS_PRUEBA.director2.nombre}`, exact: true })
  await expect(exenta).toContainText('Exento de pensión')
  await expect(exenta).toContainText('$0.00')
  await expect(exenta.getByLabel('Monto mensual en dólares')).toHaveCount(0)
  await expect(exenta.getByRole('button', { name: 'Guardar cuota', exact: true })).toHaveCount(0)
  const normal = page.getByRole('region', { name: `Cuota de ${USUARIOS_PRUEBA.residente.nombre}`, exact: true })
  await expect(normal.getByRole('button', { name: 'Guardar cuota', exact: true })).toBeEnabled()
  await normal.getByLabel('Monto mensual en dólares').fill('321.29')
  await normal.getByRole('button', { name: 'Guardar cuota', exact: true }).click()
  await expect(normal).toContainText('Cuota vigente: Profesional · $321.29')

  const donaciones = page.getByRole('region', { name: 'Ingresos por donaciones', exact: true })
  await donaciones.getByLabel('Monto mensual de ingresos por donaciones en dólares').fill('123.29')
  await donaciones.getByRole('button', { name: 'Guardar monto', exact: true }).click()
  await expect(donaciones).toContainText('Monto vigente de ingresos por donaciones: $123.29 al mes.')
  await page.goto('/pensiones/marcar')
  await page.getByRole('button', { name: /^Ingresos por donaciones/ }).click()
  const donacion = page.getByRole('region', { name: `Ingresos por donaciones de ${etiquetaPeriodo(actual)}`, exact: true })
  await expect(donacion).toContainText('Pendiente de envío')
  await donacion.getByRole('button', { name: 'Registrar envío', exact: true }).click()
  await page.getByRole('region', { name: 'Confirmar envío de ingresos por donaciones', exact: true })
    .getByRole('button', { name: 'Confirmar envío', exact: true }).click()
  await expect(donacion).toContainText('Enviado')
  await expect(donacion.getByRole('button')).toHaveCount(0)
  const pagos = await admin.from('pensiones_pagos').select('id').eq('usuario_id', ids.director2)
  expect(pagos.error).toBeNull()
  expect(pagos.data).toEqual([])
  const recepcion = await admin.from('pensiones_donaciones_recepciones').select('monto_centavos, registrado_por').eq('periodo', actual).single()
  expect(recepcion.error).toBeNull()
  expect(recepcion.data).toEqual({ monto_centavos: 12329, registrado_por: ids.director2 })
})

test('presupuesto mensual y anual excluye solo la cuenta exenta y conserva las cuotas normales', async ({ page, browser, baseURL }) => {
  await iniciarSesion(page, 'director')
  await page.goto(`/pensiones/presupuesto?anio=${anio}&mes=${mes}`)
  const resumen = page.getByRole('region', { name: 'Resumen del presupuesto', exact: true })
  await expect(resumen.locator('dl > div').filter({ hasText: 'Presupuesto mensual' })).toContainText('$300.00')
  await expect(resumen).not.toContainText('Exento de pensión')
  await expect(resumen.getByRole('status').filter({ hasText: 'con pago pendiente' }))
    .toHaveText(`1 persona con pago pendiente: ${USUARIOS_PRUEBA.residente.nombre} (falta $300.00).`)
  const sinMonto = resumen.getByRole('status').filter({ hasText: 'sin monto asignado' })
  await expect(sinMonto).toContainText(USUARIOS_PRUEBA.director.nombre)
  await expect(sinMonto).toContainText(USUARIOS_PRUEBA.residente2.nombre)
  for (const aviso of await resumen.getByRole('status').all()) {
    await expect(aviso).not.toContainText(USUARIOS_PRUEBA.director2.nombre)
  }

  await page.goto(`/pensiones/presupuesto?vista=anual&anio=${anio + 1}`)
  const anual = page.getByRole('region', { name: 'Resumen del año', exact: true })
  await expect(anual.locator('dl > div').filter({ hasText: 'Presupuesto anual' })).toContainText('$3,600.00')
  await expect(page.getByRole('region', { name: 'Mes por mes', exact: true }).getByRole('listitem')).toHaveCount(12)
  const personas = page.getByRole('region', { name: 'Por persona', exact: true })
  await expect(personas.getByText(USUARIOS_PRUEBA.director2.nombre, { exact: true })).toHaveCount(0)
  await expect(personas.getByText(USUARIOS_PRUEBA.director2.siglas, { exact: true })).toHaveCount(0)
  await expect(personas).not.toContainText('Exento de pensión')
  await expect(personas.getByRole('listitem').filter({ has: page.getByText(USUARIOS_PRUEBA.residente.nombre, { exact: true }) }))
    .toContainText('de $3,600.00')

  const contexto = await browser.newContext({ baseURL })
  try {
    const administradora = await contexto.newPage()
    await iniciarSesion(administradora, 'administradora')
    await administradora.goto(`/pensiones/presupuesto?anio=${anio}&mes=${mes}`)
    await expect(administradora.getByRole('region', { name: 'Resumen del presupuesto', exact: true }))
      .not.toContainText('Exento de pensión')
    const resumenAdministradora = administradora.getByRole('region', { name: 'Resumen del presupuesto', exact: true })
    await expect(resumenAdministradora.getByRole('status').filter({ hasText: 'con pago pendiente' }))
      .toHaveText(`1 persona con pago pendiente: ${USUARIOS_PRUEBA.residente.siglas} (falta $300.00).`)
    const sinMontoAdministradora = resumenAdministradora.getByRole('status').filter({ hasText: 'sin monto asignado' })
    await expect(sinMontoAdministradora).toContainText(USUARIOS_PRUEBA.director.siglas)
    await expect(sinMontoAdministradora).toContainText(USUARIOS_PRUEBA.residente2.siglas)
    for (const aviso of await resumenAdministradora.getByRole('status').all()) {
      await expect(aviso).not.toContainText(USUARIOS_PRUEBA.director2.siglas)
    }
    const htmlMensual = await administradora.content()
    for (const clave of ['director', 'director2', 'residente', 'residente2'] as const) expect(htmlMensual).not.toContain(USUARIOS_PRUEBA[clave].nombre)
    await administradora.goto(`/pensiones/presupuesto?vista=anual&anio=${anio + 1}`)
    const porSiglas = administradora.getByRole('region', { name: 'Por persona', exact: true })
    await expect(porSiglas.getByText(USUARIOS_PRUEBA.director2.nombre, { exact: true })).toHaveCount(0)
    await expect(porSiglas.getByText(USUARIOS_PRUEBA.director2.siglas, { exact: true })).toHaveCount(0)
    await expect(porSiglas).not.toContainText('Exento de pensión')
    await expect(porSiglas.getByRole('listitem').filter({ has: administradora.getByText(USUARIOS_PRUEBA.residente.siglas, { exact: true }) }))
      .toContainText('de $3,600.00')
    await expect(administradora.getByRole('region', { name: 'Resumen del año', exact: true })
      .locator('dl > div').filter({ hasText: 'Presupuesto anual' })).toContainText('$3,600.00')
    await expect(administradora.getByRole('region', { name: 'Mes por mes', exact: true }).getByRole('listitem')).toHaveCount(12)
    const html = await administradora.content()
    for (const clave of ['director', 'director2', 'residente', 'residente2'] as const) expect(html).not.toContain(USUARIOS_PRUEBA[clave].nombre)
  } finally { await contexto.close() }
})
