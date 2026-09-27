import { expect, test, type Locator, type Page } from '@playwright/test'
import { fechaISOEn, lunesDe, sumarDias } from '../../lib/fechas'
import { esperarAltoMinimo, esperarSinScrollLateral } from '../soporte/medidas-e2e'
import {
  asegurarUsuariosPrueba,
  clienteAdminPrueba,
  CONTRASENA_PRUEBA,
  nombresQueNoDebeVer,
  USUARIOS_PRUEBA,
  type ClaveUsuario,
} from '../soporte/usuarios-prueba'
import { marcarAusencia, panelAusencias } from './soporte/ausencias'

/*
 * "La casa" del Director: ve y cambia las comidas de todos con los mismos cierres; la persona ve que
 * fue el Director. Extras para la cocina, que Administración ve sin nombres.
 */

let ids: Record<ClaveUsuario, string>

function fechas() {
  const lunesActual = lunesDe(fechaISOEn(new Date()))
  return {
    lunesPasado: sumarDias(lunesActual, -7),
    lunesSiguiente: sumarDias(lunesActual, 7),
    miercolesSiguiente: sumarDias(lunesActual, 9),
  }
}

/** '2026-09-23' → '23/9', igual que fechaCorta de lib/comidas/semana. */
function fechaCorta(fecha: string): string {
  const [, mes, dia] = fecha.split('-')
  return `${Number(dia)}/${Number(mes)}`
}

async function iniciarSesion(page: Page, clave: ClaveUsuario) {
  await page.goto('/login')
  await page.getByLabel('Correo').fill(USUARIOS_PRUEBA[clave].correo)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
}

async function salir(page: Page) {
  await page.context().clearCookies()
}

async function limpiar(): Promise<Record<ClaveUsuario, string>> {
  const usuarios = await asegurarUsuariosPrueba()
  const admin = clienteAdminPrueba()
  const todos = Object.values(usuarios)
  // Planes y ausencias antes que las selecciones: borrarlos congela lo vencido (triggers).
  for (const tabla of ['plan_semanal', 'ausencias', 'selecciones_comida'] as const) {
    const { error } = await admin.from(tabla).delete().in('usuario_id', todos)
    if (error) throw error
  }
  const extras = await admin.from('extras_manuales').delete().in('creado_por', todos)
  if (extras.error) throw extras.error
  const resultados = await Promise.all([
    admin.from('horas_limite').update({ dia_relativo: -1, hora: '21:00' }).eq('comida', 'desayuno'),
    admin.from('horas_limite').update({ dia_relativo: 0, hora: '10:00' }).eq('comida', 'almuerzo'),
    admin.from('horas_limite').update({ dia_relativo: 0, hora: '16:00' }).eq('comida', 'cena'),
    admin.from('comidas_cerradas').delete().gte('fecha', fechas().lunesSiguiente),
  ])
  for (const { error } of resultados) if (error) throw error
  return usuarios
}

/** La celda (botón) de una comida en la tabla de La casa. */
function celdaCasa(page: Page, fecha: string, comida: 'desayuno' | 'almuerzo' | 'cena'): Locator {
  return page.locator(`.tabla-casa td[data-fecha="${fecha}"][data-comida="${comida}"] .celda-casa`)
}

/** El panel de quiénes comen, debajo de la tabla. */
function panelCasa(page: Page): Locator {
  return page.locator('.panel-casa')
}

test.beforeEach(async () => {
  ids = await limpiar()
})

test.afterEach(async () => {
  await limpiar()
})

test('el Director cambia la comida de un residente desde La casa y el residente ve que fue él', async ({ page }) => {
  const { lunesSiguiente, miercolesSiguiente } = fechas()
  const { error } = await clienteAdminPrueba()
    .from('plan_semanal')
    .insert({ usuario_id: ids.residente, dia_semana: 3, comida: 'almuerzo', estado: 'si', nota: null })
  expect(error).toBeNull()

  await iniciarSesion(page, 'director')
  await page.getByRole('link', { name: 'La casa' }).click()
  await expect(page).toHaveURL(/\/comidas\/casa$/)
  await page.goto(`/comidas/casa?semana=${lunesSiguiente}`)

  const celda = celdaCasa(page, miercolesSiguiente, 'almuerzo')
  await expect(celda).toHaveAccessibleName(new RegExp(`^Almuerzo del miércoles ${fechaCorta(miercolesSiguiente)}: `))
  await celda.click()
  await expect(celda).toHaveAttribute('aria-expanded', 'true')

  const panel = panelCasa(page)
  // Se abre debajo de la fila de su día, y el foco va a su título.
  const titulo = panel.getByRole('heading', { name: `Almuerzo del miércoles ${fechaCorta(miercolesSiguiente)}` })
  await expect(titulo).toBeFocused()
  await expect(titulo).toBeInViewport()
  await expect(page.locator('.tabla-casa tr.fila-panel .panel-casa')).toHaveCount(1)
  // Sin definir primero; el residente, entre quienes comen según su plan.
  await expect(panel.locator('.grupo-casa-titulo').first()).toContainText('Sin definir')
  const grupoSi = panel.getByRole('group', { name: /^Sí comer \(\d+\)$/ })
  const nombre = grupoSi.getByRole('button', { name: 'Residente Prueba' })
  await nombre.click()
  await expect(nombre).toHaveAttribute('aria-expanded', 'true')

  const comida = panel.locator(`.persona-comida [data-fecha="${miercolesSiguiente}"][data-comida="almuerzo"]`)
  await expect(comida.getByText('según su plan', { exact: true })).toBeVisible()
  await comida.locator('.estado-actual').click()
  await expect(comida.getByRole('group', { name: 'Elegí qué hace Residente Prueba con el almuerzo' })).toBeVisible()
  await comida.getByRole('button', { name: 'No comer', exact: true }).click()

  // Pasa al grupo de lo que eligió, y la base guarda quién lo cambió.
  await expect(panel.getByRole('group', { name: /^No comer \(1\)$/ }).getByRole('button', { name: 'Residente Prueba' })).toBeVisible()
  await expect
    .poll(async () => {
      const { data } = await clienteAdminPrueba()
        .from('selecciones_comida')
        .select('estado, origen, modificado_por')
        .eq('usuario_id', ids.residente)
        .eq('fecha', miercolesSiguiente)
        .eq('comida', 'almuerzo')
      return data
    })
    .toEqual([{ estado: 'no', origen: 'persona', modificado_por: ids.director }])

  // El residente lo ve en su Semana.
  await salir(page)
  await iniciarSesion(page, 'residente')
  await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)
  const tarjeta = page.locator('.tarjetas-semana').getByRole('button', { name: new RegExp(`^Miércoles ${fechaCorta(miercolesSiguiente)}[,.]`) })
  // A la vista sin abrir la tarjeta: el Director cambió algo de ese día.
  await expect(tarjeta).toContainText('Cambió el Director')
  await tarjeta.click()
  const suya = page.locator(`[data-fecha="${miercolesSiguiente}"][data-comida="almuerzo"]`)
  await expect(suya.getByText('la cambió el Director', { exact: true })).toBeVisible()
  await expect(suya.locator('.estado-actual')).toContainText('No comer')
})

test('"Ver la semana de": el Director cambia el plan y marca una ausencia del residente, que lo ve', async ({ page }) => {
  const { lunesSiguiente, miercolesSiguiente } = fechas()
  await iniciarSesion(page, 'director')
  await page.goto(`/comidas/casa?semana=${lunesSiguiente}`)

  await page.getByLabel('Ver la semana de:').selectOption({ label: 'Residente Prueba' })
  await page.getByRole('button', { name: 'Ver', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/comidas/casa/${ids.residente}\\?semana=${lunesSiguiente}$`))
  await expect(page.getByRole('heading', { name: 'Comidas de Residente Prueba' })).toBeVisible()
  // Arriba sigue marcada "La casa": las pestañas del propio Director no se confunden con las de la persona.
  await expect(page.getByRole('navigation', { name: 'Comidas', exact: true }).getByRole('link', { name: 'La casa' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page.getByText('Las comidas de toda la casa:', { exact: false })).toBeVisible()

  // Su plan: la cuadrícula de siempre, en tercera persona.
  await page.getByRole('link', { name: 'Su plan' }).click()
  const celda = page.getByRole('button', { name: /^Martes, cena:/ })
  await celda.click()
  await expect(page.locator('.cuadro-panel')).toContainText('¿Normalmente cena los martes?')
  await page.locator('.cuadro-panel').getByRole('button', { name: 'No comer', exact: true }).click()
  await expect(page.locator('.toast')).toHaveText('Plan semanal actualizado')
  await expect
    .poll(async () => {
      const { data } = await clienteAdminPrueba()
        .from('plan_semanal')
        .select('dia_semana, comida, estado, modificado_por')
        .eq('usuario_id', ids.residente)
      return data
    })
    .toEqual([{ dia_semana: 2, comida: 'cena', estado: 'no', modificado_por: ids.director }])

  // Sus ausencias: el mismo mini calendario.
  await page.getByRole('link', { name: 'Sus ausencias' }).click()
  const panel = page.getByRole('region', { name: 'Ausencias de Residente Prueba' })
  await marcarAusencia(page, miercolesSiguiente, miercolesSiguiente, panel)
  await expect(page.getByText('Ausencia marcada. Sus comidas de esos días quedan canceladas.')).toBeVisible()
  await expect
    .poll(async () => {
      const { data } = await clienteAdminPrueba().from('ausencias').select('desde, hasta, creado_por').eq('usuario_id', ids.residente)
      return data
    })
    .toEqual([{ desde: miercolesSiguiente, hasta: miercolesSiguiente, creado_por: ids.director }])

  // El residente lo ve: en su calendario ("La marcó el Director") y en su plan.
  await salir(page)
  await iniciarSesion(page, 'residente')
  await page.goto('/calendario')
  await expect(panelAusencias(page).getByText('La marcó el Director', { exact: true })).toBeVisible()
  await page.goto('/comidas/plan')
  const celdaPlan = page.getByRole('button', { name: /^Martes, cena:/ })
  await expect(celdaPlan).toHaveAccessibleName('Martes, cena: No comer, la cambió el Director. Cambiar')
  // Y a la vista, en la celda, con su leyenda.
  await expect(celdaPlan).toContainText('Director')
  await expect(page.locator('.leyenda-director')).toContainText('la cambió el Director')
})

test('una comida que ya cerró se ve en La casa, pero no se cambia', async ({ page }) => {
  const { lunesPasado } = fechas()
  await iniciarSesion(page, 'director')
  await page.goto(`/comidas/casa?semana=${lunesPasado}`)

  const celda = celdaCasa(page, lunesPasado, 'almuerzo')
  await expect(celda).toHaveAccessibleName(/\. Cerrada\. Ver quiénes$/)
  await celda.click()
  const panel = panelCasa(page)
  await expect(panel.getByText('Cerrada: ya no se puede cambiar. Tocá un nombre para ver su comida.')).toBeVisible()
  await panel.getByRole('button', { name: 'Residente Prueba' }).click()
  await expect(panel.locator('.persona-comida .estado-actual')).toBeDisabled()
  await expect(panel.locator('.persona-comida').getByText('Cerrada: ya no se puede cambiar.')).toBeVisible()
  // "Cerrar" devuelve el foco a la celda que lo abrió.
  await panel.getByRole('button', { name: 'Cerrar' }).click()
  await expect(panel).toHaveCount(0)
  await expect(celda).toBeFocused()

  // En una semana pasada tampoco se agregan extras.
  await expect(page.getByText('Esta semana ya pasó: no se pueden agregar extras.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Agregar extra' })).toHaveCount(0)
})

test('un extra del Director: Administración ve la cantidad y la nota, sin nombres', async ({ page }) => {
  const { lunesSiguiente, miercolesSiguiente } = fechas()
  await iniciarSesion(page, 'director')
  await page.goto(`/comidas/casa?semana=${lunesSiguiente}`)

  await page.getByRole('button', { name: 'Agregar extra' }).click()
  await page.getByRole('radio', { name: `Miércoles ${fechaCorta(miercolesSiguiente)}` }).check()
  await page.getByRole('radio', { name: 'Cena' }).check()
  await page.getByRole('button', { name: 'Una persona más' }).click()
  await page.getByRole('button', { name: 'Una persona más' }).click()
  await expect(page.getByLabel('¿Cuántas personas de más?')).toHaveValue('3')
  await page.getByLabel('Nota para la cocina (si hace falta)').fill('Sin sal')
  // Una comida de la semana siguiente no cerró: no hay aviso.
  await expect(page.getByText('Esa comida ya cerró: la cocina puede no verlo a tiempo.')).toHaveCount(0)
  await page.getByRole('button', { name: 'Guardar extra' }).click()
  await expect(page.getByText('Extra agregado. La cocina ya lo ve.')).toBeVisible()
  await expect(page.locator('.fila-extra')).toContainText(`Miércoles ${fechaCorta(miercolesSiguiente)} · Cena · 3 personas`)
  await expect(celdaCasa(page, miercolesSiguiente, 'cena')).toContainText('+3 extra')
  await expect
    .poll(async () => {
      const { data } = await clienteAdminPrueba()
        .from('extras_manuales')
        .select('fecha, tiempo_comida, cantidad, nota, creado_por')
        .eq('fecha', miercolesSiguiente)
      return data
    })
    .toEqual([{ fecha: miercolesSiguiente, tiempo_comida: 'cena', cantidad: 3, nota: 'Sin sal', creado_por: ids.director }])

  await salir(page)
  await iniciarSesion(page, 'administracion')
  await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)
  const celda = page.locator(`.admin-week-table td[data-fecha="${miercolesSiguiente}"][data-comida="cena"]`)
  await expect(celda).toContainText('+3 extra')
  await expect(celda).toContainText('3 extra: Sin sal')
  const html = await page.content()
  for (const nombre of nombresQueNoDebeVer('administracion')) expect(html).not.toContain(nombre)
})

test('solo el Director tiene La casa: los demás no ven la pestaña y vuelven a su Semana', async ({ page }) => {
  for (const clave of ['residente', 'administracion'] as const) {
    await iniciarSesion(page, clave)
    await expect(page.getByRole('navigation', { name: 'Comidas' }).getByRole('link', { name: 'La casa' })).toHaveCount(0)
    await page.goto('/comidas/casa')
    await expect(page).toHaveURL(/\/comidas\/semana$/)
    await page.goto(`/comidas/casa/${ids.residente2}`)
    await expect(page).toHaveURL(/\/comidas\/semana$/)
    await salir(page)
  }
})

test('La casa no muestra a Administración como persona, y las "Mis ausencias" del Director son solo las suyas', async ({ page }) => {
  const { lunesSiguiente, miercolesSiguiente } = fechas()
  const { error } = await clienteAdminPrueba()
    .from('ausencias')
    .insert([
      { usuario_id: ids.director, desde: miercolesSiguiente, hasta: miercolesSiguiente },
      { usuario_id: ids.residente, desde: sumarDias(miercolesSiguiente, 1), hasta: sumarDias(miercolesSiguiente, 1) },
    ])
  expect(error).toBeNull()

  await iniciarSesion(page, 'director')
  await page.goto(`/comidas/casa/${ids.administracion}`)
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()

  await page.goto('/calendario')
  await expect(panelAusencias(page).getByRole('button', { name: /^Quitar la ausencia del / })).toHaveCount(1)

  await page.goto(`/comidas/casa/${ids.residente}?ver=ausencias&semana=${lunesSiguiente}`)
  await expect(
    page.getByRole('region', { name: 'Ausencias de Residente Prueba' }).getByRole('button', { name: /^Quitar la ausencia del / }),
  ).toHaveCount(1)
})

for (const viewport of [
  { width: 320, height: 640 },
  { width: 375, height: 812 },
]) {
  test.describe(`en un teléfono de ${viewport.width}px`, () => {
    test.use({ viewport })

    test('La casa cabe sin scroll lateral y todo lo que se toca mide al menos 56px', async ({ page }) => {
      const { lunesSiguiente } = fechas()
      await iniciarSesion(page, 'director')
      await page.goto(`/comidas/casa?semana=${lunesSiguiente}`)
      // El lunes: el más lejos de lo que se abre si el panel fuera al final de la tabla.
      await celdaCasa(page, lunesSiguiente, 'almuerzo').click()
      await expect(panelCasa(page).getByRole('heading', { level: 2 })).toBeInViewport()
      await expect(panelCasa(page).getByRole('heading', { level: 2 })).toBeFocused()
      await panelCasa(page).getByRole('button', { name: 'Residente Prueba' }).click()
      await page.getByRole('button', { name: 'Agregar extra' }).click()
      await esperarSinScrollLateral(page)
      await esperarAltoMinimo(page.locator('.content button, .content a.tab-btn'))
    })
  })
}
