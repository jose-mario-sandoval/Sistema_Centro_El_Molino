import { expect, test, type Page } from '@playwright/test'
import { mesActual, etiquetaPeriodo } from '../../lib/pensiones/calculos'
import { BUCKET_REPORTES } from '../../lib/pensiones/reportes'
import { esperarAltoMinimo, esperarSinScrollLateral } from '../soporte/medidas-e2e'
import {
  asegurarUsuariosPrueba,
  clienteAdminPrueba,
  clienteComo,
  CONTRASENA_PRUEBA,
  USUARIOS_PRUEBA,
  type ClaveUsuario,
} from '../soporte/usuarios-prueba'

// El globalSetup y clienteAdminPrueba exigen Supabase temporal. Puerto 3100 sin reutilizar
// servidores: nunca usa el next dev ni el proyecto remoto del entorno de desarrollo.
const admin = clienteAdminPrueba()
const actual = mesActual()
const anio = Number(actual.slice(0, 4)) + 1
const enero = `${anio}-01-01`
const febrero = `${anio}-02-01`
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n')
let ids: Record<ClaveUsuario, string>

async function iniciarSesion(page: Page, clave: ClaveUsuario) {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(USUARIOS_PRUEBA[clave].usuario)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
}

async function configurar(clave: 'director' | 'residente' | 'residente2', monto: number, desde = actual) {
  const director = await clienteComo('director')
  const { error } = await director.rpc('guardar_cuota_pension', {
    p_usuario_id: ids[clave], p_desde: desde, p_categoria: 'universitario', p_monto_centavos: monto,
  })
  if (error) throw error
}

async function registrar(clave: 'director' | 'residente', periodo = enero) {
  const cliente = await clienteComo(clave)
  const { error } = await cliente.rpc('marcar_pensiones', { p_periodos: [periodo] })
  if (error) throw error
}

async function limpiar() {
  const usuarios = Object.values(ids)
  for (const tabla of ['pensiones_pagos', 'pensiones_cuotas'] as const) {
    const { error } = await admin.from(tabla).delete().in('usuario_id', usuarios)
    if (error) throw error
  }
  const { data: reportes, error } = await admin.from('pensiones_reportes').select('id, ruta').like('nombre', 'e2e-pensiones-%')
  if (error) throw error
  if (reportes?.length) {
    const borrado = await admin.storage.from(BUCKET_REPORTES).remove(reportes.map((r) => r.ruta))
    if (borrado.error) throw borrado.error
    const metadatos = await admin.from('pensiones_reportes').delete().in('id', reportes.map((r) => r.id))
    if (metadatos.error) throw metadatos.error
  }
}

test.beforeEach(async () => {
  ids = await asegurarUsuariosPrueba()
  await limpiar()
})
test.afterEach(async () => {
  await limpiar()
  await asegurarUsuariosPrueba()
})

test('Administración no tiene enlace y las rutas directas de Pensiones la excluyen', async ({ page }) => {
  await iniciarSesion(page, 'administracion')
  await expect(page.getByRole('link', { name: 'Pensiones', exact: true })).toHaveCount(0)
  for (const ruta of ['/pensiones', '/pensiones/editar', '/pensiones/marcar', '/pensiones/presupuesto', '/pensiones/reporte']) {
    await page.goto(ruta)
    await expect(page).toHaveURL(/\/comidas\/semana$/)
    await expect(page.getByRole('heading', { name: 'Pensiones', exact: true })).toHaveCount(0)
  }
  const descarga = await page.request.get('/api/pensiones/reportes/00000000-0000-4000-8000-000000000000')
  expect(descarga.status()).toBe(403)
})

test('Residente solo accede a sus meses y sin cuota no puede registrar pagos', async ({ page }) => {
  await iniciarSesion(page, 'residente')
  await page.getByRole('link', { name: 'Pensiones', exact: true }).filter({ visible: true }).click()
  await expect(page).toHaveURL(/\/pensiones\/marcar$/)
  await expect(page.getByRole('checkbox')).toHaveCount(12)
  for (const casilla of await page.getByRole('checkbox').all()) await expect(casilla).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Revisar pagos' })).toBeDisabled()
  await expect(page.getByRole('region', { name: 'Historial de pagos' })).toContainText('Todavía no registraste pagos.')
  for (const ruta of ['/pensiones/editar', '/pensiones/presupuesto', '/pensiones/reporte']) {
    await page.goto(ruta)
    await expect(page).toHaveURL(/\/comidas\/semana$/)
  }
  expect((await page.request.get('/api/pensiones/reportes/00000000-0000-4000-8000-000000000000')).status()).toBe(403)
})

test('Director configura cuotas individuales distintas de una misma categoría, incluida la propia', async ({ page }) => {
  await iniciarSesion(page, 'director')
  await page.goto('/pensiones/editar')
  for (const [clave, monto] of [['director', '500.00'], ['residente', '300.00'], ['residente2', '400.00']] as const) {
    const tarjeta = page.getByRole('region', { name: `Cuota de ${USUARIOS_PRUEBA[clave].nombre}`, exact: true })
    await tarjeta.getByLabel('Categoría', { exact: true }).selectOption('universitario')
    await tarjeta.getByLabel('Monto mensual en dólares').fill(monto)
    await tarjeta.getByLabel('Mes de inicio').selectOption(String(Number(actual.slice(5, 7))))
    await tarjeta.getByLabel('Año de inicio').fill(actual.slice(0, 4))
    await tarjeta.getByRole('button', { name: 'Guardar cuota' }).click()
    await expect(tarjeta).toContainText(`$${monto}`)
    await expect(tarjeta.getByRole('button', { name: 'Guardar cuota' })).toBeEnabled()
  }
  const consulta = await admin.from('pensiones_cuotas').select('usuario_id, categoria, monto_centavos').in('usuario_id', [ids.director, ids.residente, ids.residente2])
  expect(consulta.error).toBeNull()
  expect(consulta.data).toEqual(expect.arrayContaining([
    { usuario_id: ids.director, categoria: 'universitario', monto_centavos: 50000 },
    { usuario_id: ids.residente, categoria: 'universitario', monto_centavos: 30000 },
    { usuario_id: ids.residente2, categoria: 'universitario', monto_centavos: 40000 },
  ]))
})

test('confirmar varios meses propios guarda importes por vigencia, persiste y conserva el historial al cambiar de año', async ({ page }) => {
  await configurar('residente', 30000, enero)
  await configurar('residente', 40000, febrero)
  await iniciarSesion(page, 'residente')
  await page.goto(`/pensiones/marcar?anio=${anio}`)
  const primerMes = page.locator(`.pension-mes:has(input[value="${enero}"])`)
  const segundoMes = page.locator(`.pension-mes:has(input[value="${febrero}"])`)
  await primerMes.getByRole('checkbox').check()
  await segundoMes.getByRole('checkbox').check()
  await expect(page.locator('.pensiones-total')).toContainText('$700.00')
  await page.getByRole('button', { name: 'Revisar pagos' }).click()
  const confirmacion = page.getByRole('region', { name: 'Confirmar pagos' })
  await expect(confirmacion).toContainText(`${etiquetaPeriodo(enero)}: $300.00`)
  await expect(confirmacion).toContainText(`${etiquetaPeriodo(febrero)}: $400.00`)
  expect((await admin.from('pensiones_pagos').select('periodo').eq('usuario_id', ids.residente)).data).toEqual([])
  await confirmacion.getByRole('button', { name: 'Confirmar que ya pagué' }).dblclick()
  await expect(primerMes).toContainText('Pagado')
  await expect(primerMes.getByRole('checkbox')).toBeDisabled()
  await expect(segundoMes.getByRole('checkbox')).toBeDisabled()
  const guardado = await admin.from('pensiones_pagos').select('usuario_id, periodo, monto_centavos').in('usuario_id', [ids.residente, ids.residente2])
  expect(guardado.error).toBeNull()
  expect(guardado.data).toHaveLength(2)
  expect(guardado.data).toEqual(expect.arrayContaining([
    { usuario_id: ids.residente, periodo: enero, monto_centavos: 30000 },
    { usuario_id: ids.residente, periodo: febrero, monto_centavos: 40000 },
  ]))
  await configurar('residente', 50000, enero)
  await page.reload()
  await expect(primerMes).toContainText('$300.00')
  await expect(segundoMes).toContainText('$400.00')
  await page.getByLabel('Año', { exact: true }).fill(String(anio + 1))
  await page.getByRole('button', { name: 'Consultar', exact: true }).click()
  const historial = page.getByRole('region', { name: 'Historial de pagos' })
  await expect(historial).toContainText(etiquetaPeriodo(enero))
  await expect(historial).toContainText('$300.00')
  await expect(historial).toContainText(etiquetaPeriodo(febrero))
})

test('si cambia una cuota durante la revisión mantiene el total revisado y exige confirmarlo de nuevo', async ({ page }) => {
  await configurar('residente', 30000, enero)
  await iniciarSesion(page, 'residente')
  await page.goto(`/pensiones/marcar?anio=${anio}`)
  const mes = page.locator(`.pension-mes:has(input[value="${enero}"])`)
  await mes.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Revisar pagos' }).click()
  const revision = page.getByRole('region', { name: 'Confirmar pagos' })
  await expect(revision).toContainText('Total: $300.00')
  await configurar('residente', 40000, enero)
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(mes).toContainText('$400.00')
  await expect(revision).toContainText('Total: $300.00')
  await revision.getByRole('button', { name: 'Confirmar que ya pagué' }).click()
  await expect(page.getByRole('region', { name: 'Meses de pensión' }).getByRole('alert'))
    .toContainText('No se registraron los pagos.')
  expect((await admin.from('pensiones_pagos').select('periodo').eq('usuario_id', ids.residente)).data).toEqual([])
  await page.getByRole('button', { name: 'Revisar pagos' }).click()
  await expect(revision).toContainText('Total: $400.00')
  await revision.getByRole('button', { name: 'Confirmar que ya pagué' }).click()
  await expect(mes).toContainText('Pagado')
})

test('Director marca únicamente sus meses, aunque pueda consultar pagos ajenos en Presupuesto', async ({ page }) => {
  await configurar('director', 50000)
  await configurar('residente', 30000)
  await registrar('residente')
  await iniciarSesion(page, 'director')
  await page.goto(`/pensiones/marcar?anio=${anio}`)
  const eneroPropio = page.locator(`.pension-mes:has(input[value="${enero}"])`)
  await expect(eneroPropio).toContainText('Pendiente')
  await expect(eneroPropio).toContainText('$500.00')
  await eneroPropio.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Revisar pagos' }).click()
  await page.getByRole('button', { name: 'Confirmar que ya pagué' }).click()
  await expect(eneroPropio).toContainText('Pagado')
  const pagos = await admin.from('pensiones_pagos').select('usuario_id, monto_centavos').eq('periodo', enero).in('usuario_id', [ids.director, ids.residente])
  expect(pagos.data).toEqual(expect.arrayContaining([
    { usuario_id: ids.director, monto_centavos: 50000 },
    { usuario_id: ids.residente, monto_centavos: 30000 },
  ]))
})

test('Presupuesto entrega nombres al Director y solo siglas a la Administradora', async ({ page, browser, baseURL }) => {
  await configurar('residente', 30000)
  await registrar('residente')
  await iniciarSesion(page, 'administradora')
  await page.goto(`/pensiones/presupuesto?anio=${anio}&mes=1`)
  const pagos = page.getByRole('region', { name: 'Pagos del período' })
  await expect(pagos).toContainText(USUARIOS_PRUEBA.residente.siglas)
  await expect(pagos).toContainText('$300.00')
  const html = await page.content()
  for (const clave of ['director', 'director2', 'residente', 'residente2'] as const) expect(html).not.toContain(USUARIOS_PRUEBA[clave].nombre)
  await page.goto('/pensiones/editar')
  await expect(page).toHaveURL(/\/comidas\/semana$/)
  await page.goto('/pensiones/marcar')
  await expect(page).toHaveURL(/\/comidas\/semana$/)
  const otroContexto = await browser.newContext({ baseURL })
  try {
    const director = await otroContexto.newPage()
    await iniciarSesion(director, 'director')
    await director.goto(`/pensiones/presupuesto?anio=${anio}&mes=1`)
    await expect(director.getByRole('region', { name: 'Pagos del período' })).toContainText(USUARIOS_PRUEBA.residente.nombre)
  } finally { await otroContexto.close() }
})

test('Presupuesto del año completo: total, mes por mes y por persona, con siglas para la Administradora', async ({ page, browser, baseURL }) => {
  await configurar('residente', 30000)
  await registrar('residente')
  await iniciarSesion(page, 'administradora')
  await page.goto(`/pensiones/presupuesto?vista=anual&anio=${anio}`)
  const resumen = page.getByRole('region', { name: 'Resumen del año' })
  await expect(resumen).toContainText(`Año ${anio}`)
  await expect(resumen).toContainText('$300.00')
  await expect(resumen).toContainText('$3,600.00')
  await expect(page.getByRole('region', { name: 'Mes por mes' }).getByRole('listitem')).toHaveCount(12)
  const porPersona = page.getByRole('region', { name: 'Por persona' })
  await expect(porPersona).toContainText(USUARIOS_PRUEBA.residente.siglas)
  const html = await page.content()
  for (const clave of ['director', 'director2', 'residente', 'residente2'] as const) expect(html).not.toContain(USUARIOS_PRUEBA[clave].nombre)
  await page.getByRole('link', { name: `Ver el detalle de Enero de ${anio}` }).click()
  await expect(page).toHaveURL(new RegExp(`/pensiones/presupuesto\\?anio=${anio}&mes=1$`))
  const contexto = await browser.newContext({ baseURL })
  try {
    const director = await contexto.newPage()
    await iniciarSesion(director, 'director')
    await director.goto(`/pensiones/presupuesto?vista=anual&anio=${anio}`)
    await expect(director.getByRole('region', { name: 'Por persona' })).toContainText(USUARIOS_PRUEBA.residente.nombre)
  } finally { await contexto.close() }
})

test('Administradora sube PDF validado y Director consulta y descarga sin controles de carga', async ({ page, browser, baseURL }) => {
  await iniciarSesion(page, 'administradora')
  await page.goto('/pensiones/reporte')
  await expect(page.getByRole('heading', { name: 'Reporte finanzas', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Reporte de otras utilidades', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Subir PDF · Reporte finanzas', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Subir PDF · Reporte finanzas', exact: true })
  await modal.getByLabel('Documento PDF').setInputFiles({ name: 'e2e-pensiones-invalido.pdf', mimeType: 'application/pdf', buffer: Buffer.from('Esto no es un PDF') })
  await modal.getByRole('button', { name: 'Guardar PDF', exact: true }).click()
  await expect(modal.getByRole('alert')).toContainText('no es un PDF válido')
  await modal.getByLabel('Documento PDF').setInputFiles({ name: 'e2e-pensiones-finanzas.pdf', mimeType: 'application/pdf', buffer: PDF })
  await modal.getByRole('button', { name: 'Guardar PDF', exact: true }).click()
  await expect(modal).toHaveCount(0)
  const enlace = page.getByRole('link', { name: 'Descargar e2e-pensiones-finanzas.pdf', exact: true })
  await expect(enlace).toBeVisible()
  const ruta = await enlace.getAttribute('href')
  expect(ruta).toMatch(/^\/api\/pensiones\/reportes\//)
  const autorizado = await page.request.get(ruta!)
  expect(autorizado.status()).toBe(200)
  expect(autorizado.headers()['content-type']).toBe('application/pdf')
  expect(await autorizado.body()).toEqual(PDF)
  const contextoDirector = await browser.newContext({ baseURL })
  try {
    const director = await contextoDirector.newPage()
    await iniciarSesion(director, 'director')
    await director.goto('/pensiones/reporte')
    await expect(director.getByRole('button', { name: /^Subir PDF/ })).toHaveCount(0)
    const [descarga] = await Promise.all([
      director.waitForEvent('download'),
      director.getByRole('link', { name: 'Descargar e2e-pensiones-finanzas.pdf', exact: true }).click(),
    ])
    expect(descarga.suggestedFilename()).toBe('e2e-pensiones-finanzas.pdf')
    expect(await descarga.failure()).toBeNull()
  } finally { await contextoDirector.close() }
})

test('navegación móvil incorpora Pensiones con etiquetas completas y controles de 56 px con letra enorme', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await iniciarSesion(page, 'residente')
  await page.evaluate(() => {
    document.documentElement.dataset.texto = 'enorme'
    document.documentElement.dataset.theme = 'dark'
    document.documentElement.dataset.contraste = 'alto'
  })
  const barra = page.locator('.barra-inferior')
  await expect(barra.getByRole('link')).toHaveCount(5)
  await esperarAltoMinimo(barra.getByRole('link'))
  await esperarSinScrollLateral(page)
  const recortados = await barra.locator('.nav-item').evaluateAll((elementos) => elementos.flatMap((enlace) => {
    const caja = enlace.getBoundingClientRect()
    const texto = enlace.querySelector('span')!.getBoundingClientRect()
    return caja.width < 56 || caja.left < 0 || caja.right > window.innerWidth || texto.left < caja.left || texto.right > caja.right
      ? [enlace.textContent?.trim()] : []
  }))
  expect(recortados).toEqual([])
  await barra.getByRole('link', { name: 'Pensiones', exact: true }).click()
  await expect(page).toHaveURL(/\/pensiones\/marcar$/)
  await expect(barra.getByRole('link', { name: 'Pensiones', exact: true })).toHaveAttribute('aria-current', 'page')
  await esperarSinScrollLateral(page)
})
