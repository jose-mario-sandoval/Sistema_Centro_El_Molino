import { expect, test, type Page } from '@playwright/test'
import { etiquetaPeriodo, mesActual } from '../../lib/pensiones/calculos'
import { esperarAltoMinimo, esperarSinScrollLateral } from '../soporte/medidas-e2e'
import { asegurarUsuariosPrueba, clienteAdminPrueba, clienteComo, CONTRASENA_PRUEBA, USUARIOS_PRUEBA, type ClaveUsuario } from '../soporte/usuarios-prueba'

// Los helpers y globalSetup rechazan bases remotas. Solo Supabase temporal de CI.
const admin = clienteAdminPrueba()
const actual = mesActual()
const anio = Number(actual.slice(0, 4)) + 1
const enero = `${anio}-01-01`, febrero = `${anio}-02-01`
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
}

test.beforeEach(async () => {
  ids = await asegurarUsuariosPrueba()
  await limpiar()
  const { error } = await admin.from('pensiones_participacion').insert(
    (['director', 'director2', 'residente', 'residente2'] as const).map((clave) => ({ usuario_id: ids[clave], desde: actual, incluido: true })),
  )
  if (error) throw error
  const director = await clienteComo('director')
  for (const [clave, monto] of [['director', 50000], ['director2', 40000], ['residente', 30000]] as const) {
    const cuota = await director.rpc('guardar_cuota_pension', { p_usuario_id: ids[clave], p_desde: actual, p_categoria: 'profesional', p_monto_centavos: monto })
    if (cuota.error) throw cuota.error
  }
})
test.afterEach(async () => {
  if (ids) await limpiar()
  await asegurarUsuariosPrueba()
})

for (const clave of ['residente', 'administracion', 'administradora'] as const) test(`${clave} no accede a Pensiones de la casa`, async ({ page }) => {
  await iniciarSesion(page, clave)
  await page.goto(clave === 'administracion' ? '/comidas/semana' : '/pensiones')
  await expect(page.getByRole('link', { name: 'Pensiones de la casa', exact: true })).toHaveCount(0)
  await page.goto(`/pensiones/casa?persona=${ids.residente}&anio=${anio}`)
  await expect(page).toHaveURL(/\/comidas\/semana$/)
  await expect(page.getByRole('heading', { name: 'Pensiones de la casa', exact: true })).toHaveCount(0)
})

for (const clave of ['residente', 'director2'] as const) test(`Director registra varios meses y un abono de ${clave}, con historial y presupuesto del titular`, async ({ page, browser, baseURL }) => {
  test.setTimeout(90_000)
  const cuota = clave === 'residente' ? 30000 : 40000
  await iniciarSesion(page, 'director')
  await page.goto('/pensiones/casa')
  const persona = page.getByLabel('Persona', { exact: true })
  await expect(persona.locator(`option[value="${ids.director}"]`)).toHaveCount(0)
  await expect(persona.locator(`option[value="${ids.administracion}"]`)).toHaveCount(0)
  await expect(persona.locator(`option[value="${ids.administradora}"]`)).toHaveCount(0)
  await persona.selectOption(ids[clave])
  await page.getByLabel('Año', { exact: true }).fill(String(anio))
  await page.getByRole('button', { name: 'Consultar', exact: true }).click()
  await expect(page.getByRole('heading', { name: `Pensión de ${USUARIOS_PRUEBA[clave].nombre}`, exact: true })).toBeVisible()
  const primero = page.locator(`.pension-mes:has(input[value="${enero}"])`)
  const segundo = page.locator(`.pension-mes:has(input[value="${febrero}"])`)
  await expect(primero).toContainText(`Cuota: $${(cuota / 100).toFixed(2)}`)
  await primero.getByRole('checkbox').check()
  await segundo.getByRole('checkbox').check()
  await page.getByLabel(`¿Cuánto pagó de ${etiquetaPeriodo(enero)}?`).fill('100.00')
  await page.getByRole('button', { name: 'Revisar pagos', exact: true }).click()
  const revision = page.getByRole('region', { name: 'Confirmar pagos', exact: true })
  await expect(revision.getByRole('heading')).toBeFocused()
  await expect(revision).toContainText(USUARIOS_PRUEBA[clave].nombre)
  await expect(revision).toContainText(`${etiquetaPeriodo(enero)}: $100.00`)
  await expect(revision).toContainText(`${etiquetaPeriodo(febrero)}: $${(cuota / 100).toFixed(2)}`)
  await expect(revision).toContainText(`Total: $${((cuota + 10000) / 100).toFixed(2)}`)
  await revision.getByRole('button', { name: 'Confirmar pago de esta persona', exact: true }).click()
  await expect(primero).toContainText('Pago parcial')
  await expect(primero).toContainText(`Saldo pendiente: $${((cuota - 10000) / 100).toFixed(2)}`)
  await expect(segundo.getByRole('checkbox')).toBeDisabled()
  const historial = page.getByRole('region', { name: 'Historial de pagos', exact: true })
  await expect(historial.getByText('Registrado por el Director', { exact: true })).toHaveCount(2)
  const guardado = await admin.from('pensiones_pagos').select('usuario_id, registrado_por, periodo, monto_centavos, abono_centavos').eq('usuario_id', ids[clave]).order('periodo')
  expect(guardado.error).toBeNull()
  expect(guardado.data).toEqual([
    { usuario_id: ids[clave], registrado_por: ids.director, periodo: enero, monto_centavos: cuota, abono_centavos: 10000 },
    { usuario_id: ids[clave], registrado_por: ids.director, periodo: febrero, monto_centavos: cuota, abono_centavos: cuota },
  ])
  expect((await admin.from('pensiones_pagos').select('id').eq('usuario_id', ids.director)).data).toEqual([])

  const contexto = await browser.newContext({ baseURL })
  try {
    const titular = await contexto.newPage()
    await iniciarSesion(titular, clave)
    await titular.goto(`/pensiones/marcar?anio=${anio}`)
    if (clave === 'director2') await titular.getByRole('button', { name: /^Mi pensión/ }).click()
    await expect(titular.locator(`.pension-mes:has(input[value="${enero}"])`)).toContainText('Pago parcial')
    await expect(titular.getByRole('region', { name: 'Historial de pagos', exact: true }).getByText('Registrado por el Director', { exact: true })).toHaveCount(2)
  } finally { await contexto.close() }

  await page.goto(`/pensiones/presupuesto?anio=${anio}&mes=1`)
  await expect(page.getByRole('region', { name: 'Pagos del período', exact: true }).getByRole('listitem').filter({ hasText: USUARIOS_PRUEBA[clave].nombre })).toContainText('$100.00')
})

test('cambiar persona o año limpia la selección y la revisión; formulario accesible en móvil y escritorio', async ({ page }) => {
  await iniciarSesion(page, 'director')
  await page.goto(`/pensiones/casa?persona=${ids.residente}&anio=${anio}`)
  await page.locator(`.pension-mes input[value="${enero}"]`).check()
  await page.getByRole('button', { name: 'Revisar pagos', exact: true }).click()
  await page.getByRole('region', { name: 'Confirmar pagos', exact: true }).getByRole('button', { name: 'Volver a elegir', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Revisar pagos', exact: true })).toBeFocused()
  await page.getByLabel('Persona', { exact: true }).selectOption(ids.director2)
  await page.getByRole('button', { name: 'Consultar', exact: true }).click()
  await expect(page.locator('.pensiones-total')).toContainText('0 meses seleccionados')
  await expect(page.getByRole('region', { name: 'Confirmar pagos', exact: true })).toHaveCount(0)
  await page.getByLabel('Año', { exact: true }).fill(String(anio + 1))
  await page.getByRole('button', { name: 'Consultar', exact: true }).click()
  await expect(page.getByLabel('Persona', { exact: true })).toHaveValue(ids.director2)
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => { document.documentElement.dataset.texto = 'enorme'; document.documentElement.dataset.contraste = 'alto' })
    await esperarSinScrollLateral(page)
    await esperarAltoMinimo(page.locator('button, select, input:not([type="checkbox"])'))
  }
})

test('el Director ve las cuentas exentas sin registrar pagos de cero y excluye cuentas inactivas', async ({ page }) => {
  const exencion = await admin.rpc('activar_exencion_pension', { p_usuario_id: ids.director2 })
  if (exencion.error) throw exencion.error
  const desactivar = await admin.from('perfiles').update({ activo: false }).eq('id', ids.residente2)
  if (desactivar.error) throw desactivar.error
  await iniciarSesion(page, 'director')
  await page.goto(`/pensiones/casa?persona=${ids.director2}&anio=${anio}`)
  await expect(page.getByLabel('Persona', { exact: true }).locator(`option[value="${ids.residente2}"]`)).toHaveCount(0)
  await expect(page.locator('.pension-mes').first()).toContainText('Exento de pensión')
  for (const casilla of await page.getByRole('checkbox').all()) await expect(casilla).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Revisar pagos', exact: true })).toBeDisabled()
  expect((await admin.from('pensiones_pagos').select('id').eq('usuario_id', ids.director2)).data).toEqual([])
  await page.goto(`/pensiones/casa?persona=${ids.residente2}&anio=${anio}`)
  await expect(page.getByRole('status')).toContainText('Elegí una cuenta activa')
  await expect(page.getByRole('region', { name: 'Meses de pensión', exact: true })).toHaveCount(0)
})
