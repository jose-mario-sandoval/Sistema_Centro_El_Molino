import { expect, test, type Locator, type Page } from '@playwright/test'
import { etiquetaPeriodo, mesActual } from '../../lib/pensiones/calculos'
import { ETIQUETA_DONACIONES, ETIQUETA_PRESUPUESTO } from '../../lib/pensiones/etiquetas'
import { esperarSinScrollLateral } from '../soporte/medidas-e2e'
import {
  asegurarUsuariosPrueba, clienteAdminPrueba, clienteComo, CONTRASENA_PRUEBA,
  nombresQueNoDebeVer, USUARIOS_PRUEBA, type ClaveUsuario,
} from '../soporte/usuarios-prueba'

// clienteAdminPrueba y globalSetup rechazan cualquier URL que no sea Supabase local.
// El período futuro permite verificar que la recepción se asigna al mes seleccionado,
// aunque la fecha de la operación sea otra. Los importes son sólo fixtures de prueba.
const admin = clienteAdminPrueba()
const actual = mesActual()
const anio = Number(actual.slice(0, 4)) + 1
const enero = `${anio}-01-01`
let ids: Record<ClaveUsuario, string>

async function iniciarSesion(page: Page, clave: ClaveUsuario) {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(USUARIOS_PRUEBA[clave].usuario)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
}

async function limpiar() {
  if (!ids) return
  for (const [tabla, columna] of [
    ['pensiones_donaciones_recepciones', 'periodo'],
    ['pensiones_donaciones_configuracion', 'desde'],
  ]) {
    const { error } = await admin.from(tabla).delete().gte(columna, '2000-01-01')
    if (error) throw error
  }
  const { error: exencion } = await admin.from('pensiones_exencion').delete().eq('unica', true)
  if (exencion) throw exencion
  for (const tabla of ['pensiones_pagos', 'pensiones_cuotas', 'pensiones_participacion']) {
    const { error } = await admin.from(tabla).delete().in('usuario_id', Object.values(ids))
    if (error) throw error
  }
}

async function esperarCifra(region: Locator, etiqueta: string, importe: string) {
  await expect(region.getByText(etiqueta, { exact: true }).locator('..').locator('dd')).toHaveText(importe, { timeout: 15_000 })
}

async function esperarPrivacidad(page: Page) {
  const html = await page.content()
  for (const nombre of nombresQueNoDebeVer('administradora')) expect(html).not.toContain(nombre)
  expect(html).not.toContain('registrado_por')
  await expect(page.getByRole('button', { name: 'Registrar envío', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Confirmar envío', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Editar', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Marcar pensiones', exact: true })).toHaveCount(0)
}

test.beforeEach(async () => {
  ids = await asegurarUsuariosPrueba()
  await limpiar()
  const { error: participacion } = await admin.from('pensiones_participacion').insert(
    (['director', 'director2', 'residente', 'residente2'] as const)
      .map((clave) => ({ usuario_id: ids[clave], desde: enero, incluido: true })),
  )
  if (participacion) throw participacion
  const director = await clienteComo('director')
  const cuota = await director.rpc('guardar_cuota_pension', {
    p_usuario_id: ids.residente, p_desde: enero, p_categoria: 'universitario', p_monto_centavos: 100000,
  })
  if (cuota.error) throw cuota.error
  const donacion = await director.rpc('guardar_donacion_pension', { p_desde: enero, p_monto_centavos: 20000 })
  if (donacion.error) throw donacion.error
  const abono = await (await clienteComo('residente')).rpc('marcar_pensiones', {
    p_periodos: [enero], p_montos_esperados: [100000], p_pagados_esperados: [0], p_abonos: [60000],
  })
  if (abono.error) throw abono.error
})

test.afterEach(limpiar)

test('Administradora ve el mismo presupuesto y su avance al recibir el Director el ingreso de otro período', async ({ page, browser, baseURL }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 375, height: 900 })
  await iniciarSesion(page, 'administradora')
  await page.goto(`/pensiones/presupuesto?anio=${anio}&mes=1`)
  await page.evaluate(() => {
    document.documentElement.dataset.texto = 'enorme'
    document.documentElement.dataset.contraste = 'alto'
  })
  const resumen = page.getByRole('region', { name: 'Resumen del presupuesto', exact: true })
  const ingresos = page.getByRole('region', { name: 'Pagos del período', exact: true })
  const donacion = ingresos.getByRole('listitem', { name: ETIQUETA_DONACIONES, exact: true })
  await esperarCifra(resumen, ETIQUETA_PRESUPUESTO.mensual, '$1,200.00')
  await esperarCifra(resumen, ETIQUETA_PRESUPUESTO.ejecutado, '$600.00')
  await esperarCifra(resumen, ETIQUETA_PRESUPUESTO.pendiente, '$600.00')
  await expect(resumen.getByRole('progressbar')).toHaveAccessibleName('Avance del presupuesto mensual: 50.0 %')
  await expect(resumen.getByRole('progressbar')).toHaveJSProperty('value', 50)
  await expect(ingresos.getByRole('listitem')).toHaveCount(1)
  await expect(donacion).toHaveCount(0)
  await expect(resumen).toContainText('1 persona con pago pendiente: RP (falta $400.00)')
  await expect(ingresos.getByRole('listitem', { name: 'RP', exact: true }).locator('span')).toHaveText('$600.00')
  await expect(page.getByRole('link', { name: 'Resúmenes', exact: true })).toHaveAttribute('href', '/pensiones/reporte')
  await esperarPrivacidad(page)
  await esperarSinScrollLateral(page)

  const contextoDirector = await browser.newContext({ baseURL, viewport: { width: 320, height: 900 } })
  try {
    const director = await contextoDirector.newPage()
    await iniciarSesion(director, 'director')
    await director.goto(`/pensiones/marcar?anio=${anio}`)
    await director.evaluate(() => {
      document.documentElement.dataset.texto = 'enorme'
      document.documentElement.dataset.theme = 'dark'
      document.documentElement.dataset.contraste = 'alto'
    })
    const panel = director.getByRole('button', { name: new RegExp(`^${ETIQUETA_DONACIONES}`) })
    await expect(panel).toHaveAttribute('aria-expanded', 'false')
    await expect(panel).toContainText('Registrá el envío del dinero de donaciones a la administración')
    await panel.click()
    const mes = director.getByRole('region', { name: `${ETIQUETA_DONACIONES} de ${etiquetaPeriodo(enero)}`, exact: true })
    await mes.getByRole('button', { name: 'Registrar envío', exact: true }).click()
    const confirmacion = director.getByRole('region', { name: 'Confirmar envío de ingresos por donaciones', exact: true })
    await expect(confirmacion).toContainText(etiquetaPeriodo(enero))
    await expect(confirmacion).toContainText('$200.00')
    await confirmacion.getByRole('button', { name: 'Confirmar envío', exact: true }).click()
    await expect(mes).toContainText('Enviado')
    await esperarSinScrollLateral(director)

    // Volver a la pestaña usa el refresco existente; Administradora no lee tablas privadas
    // ni necesita permisos Realtime sobre el autor o los snapshots de la donación.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await esperarCifra(resumen, ETIQUETA_PRESUPUESTO.mensual, '$1,200.00')
    await esperarCifra(resumen, ETIQUETA_PRESUPUESTO.ejecutado, '$800.00')
    await esperarCifra(resumen, ETIQUETA_PRESUPUESTO.pendiente, '$400.00')
    await expect(resumen.getByRole('progressbar')).toHaveAccessibleName('Avance del presupuesto mensual: 66.7 %')
    await expect(resumen.getByRole('progressbar')).toHaveJSProperty('value', 80000 / 120000 * 100)
    await expect(ingresos.getByRole('listitem')).toHaveCount(2)
    await expect(donacion.locator('span')).toHaveText('$200.00')
    await expect(ingresos.getByRole('listitem', { name: 'RP', exact: true }).locator('span')).toHaveText('$600.00')
    await expect(resumen).toContainText('1 persona con pago pendiente: RP (falta $400.00)')
    await esperarPrivacidad(page)
    await esperarSinScrollLateral(page)

    await director.goto(`/pensiones/presupuesto?anio=${anio}&mes=1`)
    await expect(director.getByRole('region', { name: 'Pagos del período', exact: true })).toContainText(USUARIOS_PRUEBA.residente.nombre)
    await esperarCifra(director.getByRole('region', { name: 'Resumen del presupuesto', exact: true }), ETIQUETA_PRESUPUESTO.ejecutado, '$800.00')
    await expect(director.getByRole('link', { name: 'Resúmenes', exact: true })).toHaveAttribute('href', '/pensiones/reporte')
    const recepciones = await admin.from('pensiones_donaciones_recepciones').select('periodo, monto_centavos, registrado_por').eq('periodo', enero)
    expect(recepciones.error).toBeNull()
    expect(recepciones.data).toEqual([{ periodo: enero, monto_centavos: 20000, registrado_por: ids.director }])
    expect((await admin.from('pensiones_pagos').select('id').in('usuario_id', [ids.director, ids.director2])).data).toEqual([])
  } finally { await contextoDirector.close() }
})

test('el año incluye la recepción ya guardada una sola vez y la presenta fuera de las personas', async ({ page }) => {
  const director = await clienteComo('director2')
  const guardado = await director.rpc('recibir_donacion_pension', { p_periodo: enero, p_monto_esperado: 20000 })
  expect(guardado.error).toBeNull()
  expect(guardado.data[0].nueva).toBe(true)
  const reintento = await director.rpc('recibir_donacion_pension', { p_periodo: enero, p_monto_esperado: 20000 })
  expect(reintento.error).toBeNull()
  expect(reintento.data[0].nueva).toBe(false)
  await iniciarSesion(page, 'administradora')
  await page.goto(`/pensiones/presupuesto?vista=anual&anio=${anio}`)
  const resumen = page.getByRole('region', { name: 'Resumen del año', exact: true })
  await esperarCifra(resumen, ETIQUETA_PRESUPUESTO.anual, '$14,400.00')
  await esperarCifra(resumen, ETIQUETA_PRESUPUESTO.ejecutadoAnual, '$800.00')
  await esperarCifra(resumen, ETIQUETA_PRESUPUESTO.pendiente, '$13,600.00')
  await expect(resumen.getByRole('progressbar')).toHaveAccessibleName('Avance del presupuesto anual: 5.6 %')
  const donaciones = page.getByRole('region', { name: ETIQUETA_DONACIONES, exact: true })
  await esperarCifra(donaciones, ETIQUETA_PRESUPUESTO.anual, '$2,400.00')
  await esperarCifra(donaciones, 'Recibido', '$200.00')
  await esperarCifra(donaciones, ETIQUETA_PRESUPUESTO.pendiente, '$2,200.00')
  const personas = page.getByRole('region', { name: 'Por persona', exact: true })
  await expect(personas).toContainText('RP')
  await expect(personas).toContainText('Recibido $600.00 de $12,000.00')
  await expect(personas).not.toContainText(ETIQUETA_DONACIONES)
  const meses = page.getByRole('region', { name: 'Mes por mes', exact: true }).getByRole('listitem')
  await expect(meses).toHaveCount(12)
  await expect(meses.first()).toContainText('Presupuesto mensual: $1,200.00')
  await expect(meses.first()).toContainText('Real mensual: $800.00')
  await expect(meses.first()).toContainText('Pendiente de recibir: $400.00')
  await expect(meses.nth(1)).toContainText('Real mensual: $0.00')
  await esperarPrivacidad(page)
  await page.getByRole('link', { name: `Ver el detalle de Enero de ${anio}`, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/pensiones/presupuesto\\?anio=${anio}&mes=1$`))
  await esperarCifra(page.getByRole('region', { name: 'Resumen del presupuesto', exact: true }), ETIQUETA_PRESUPUESTO.mensual, '$1,200.00')
  await esperarPrivacidad(page)
})
