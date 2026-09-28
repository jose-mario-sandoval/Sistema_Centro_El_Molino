import { expect, test, type Locator, type Page } from '@playwright/test'
import { fechaISOEn, lunesDe, sumarDias } from '../../lib/fechas'
import { esperarAltoMinimo, esperarDentroDeLaPantalla, esperarSinScrollLateral } from '../soporte/medidas-e2e'
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
 * fue el Director. Extras para la cocina desde el "+ Extra" de cada comida, que Administración ve sin
 * nombres. Tocar un nombre o un "+ Extra" abre una burbuja junto a él (un diálogo no modal).
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

/** El panel de quiénes comen, debajo de la fila de su día. */
function panelCasa(page: Page): Locator {
  return page.locator('.panel-casa')
}

/** El "+ Extra" de una comida: en la esquina de su celda, al lado (no dentro) de su botón. */
function botonExtra(page: Page, comida: 'desayuno' | 'almuerzo' | 'cena', fecha: string): Locator {
  const nombre = { desayuno: 'al desayuno', almuerzo: 'al almuerzo', cena: 'a la cena' }[comida]
  const [, mes, dia] = fecha.split('-')
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const nombreDia = dias[new Date(`${fecha}T12:00:00Z`).getUTCDay()]
  return page.getByRole('button', { name: `Agregar extra ${nombre} del ${nombreDia} ${Number(dia)}/${Number(mes)}`, exact: true })
}

/** Un toque fuera de la burbuja, en un lugar que no hace nada (la burbuja siempre deja 16px de margen). */
async function tocarFuera(page: Page) {
  await page.mouse.click(4, 300)
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

  // Su comida, en una burbuja junto a su nombre, con las mismas opciones que ve la persona.
  const burbuja = page.getByRole('dialog', { name: `Almuerzo de Residente Prueba, miércoles ${fechaCorta(miercolesSiguiente)}` })
  await expect(burbuja.getByText('según su plan', { exact: true })).toBeVisible()
  await expect(burbuja.getByRole('group', { name: 'Elegí qué hace Residente Prueba con el almuerzo' })).toBeVisible()
  await expect(burbuja.getByRole('button', { name: 'Sí comer', exact: true })).toBeFocused()
  await burbuja.getByRole('button', { name: 'No comer', exact: true }).click()

  // Pasa al grupo de lo que eligió (la burbuja sigue abierta), y la base guarda quién lo cambió.
  await expect(panel.getByRole('group', { name: /^No comer \(1\)$/ }).getByRole('button', { name: 'Residente Prueba' })).toBeVisible()
  await expect(burbuja.getByText('la cambió el Director', { exact: true })).toBeVisible()
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

  // Escape cierra la burbuja y el foco vuelve a su nombre (ya en su nuevo grupo).
  await page.keyboard.press('Escape')
  await expect(burbuja).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Residente Prueba' })).toBeFocused()

  // El residente lo ve en su Semana, sin abrir nada: lápiz + "Director" en esa comida, con la leyenda.
  await salir(page)
  await iniciarSesion(page, 'residente')
  await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)
  const suya = page.locator(`.tarjetas-semana button.comida-tarjeta[data-fecha="${miercolesSiguiente}"][data-comida="almuerzo"]`)
  await expect(suya).toContainText('Director')
  await expect(suya).toHaveAccessibleName(
    `Almuerzo del miércoles ${fechaCorta(miercolesSiguiente)}: No comer, la cambió el Director. Cambiar`,
  )
  await expect(page.locator('.leyenda-director')).toContainText('la cambió el Director')
  await suya.click()
  const suyaBurbuja = page.getByRole('dialog', { name: `Almuerzo del miércoles ${fechaCorta(miercolesSiguiente)}` })
  await expect(suyaBurbuja.getByText('la cambió el Director', { exact: true })).toBeVisible()
  await expect(suyaBurbuja.getByRole('button', { name: 'No comer', exact: true })).toHaveAttribute('aria-pressed', 'true')
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
  const burbujaPlan = page.getByRole('dialog', { name: 'Cena de los martes' })
  await expect(burbujaPlan).toContainText('¿Normalmente cena los martes?')
  await burbujaPlan.getByRole('button', { name: 'No comer', exact: true }).click()
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
  const nombre = panel.getByRole('button', { name: 'Residente Prueba' })
  await nombre.click()
  // La burbuja de una comida cerrada solo se lee: sin opciones, con candado y el motivo.
  const burbuja = page.getByRole('dialog', { name: new RegExp(`^Almuerzo de Residente Prueba, lunes ${fechaCorta(lunesPasado)}$`) })
  await expect(burbuja.getByText('Cerrada: ya no se puede cambiar.')).toBeVisible()
  await expect(burbuja.locator('.status-chip')).toHaveCount(0)
  await burbuja.getByRole('button', { name: 'Listo' }).click()
  await expect(burbuja).toHaveCount(0)
  await expect(nombre).toBeFocused()
  // "Cerrar" devuelve el foco a la celda que lo abrió.
  await panel.getByRole('button', { name: 'Cerrar' }).click()
  await expect(panel).toHaveCount(0)
  await expect(celda).toBeFocused()

  // En una semana pasada no hay "+ Extra": los extras se agregan desde hoy. Y ya no hay formulario abajo.
  await expect(page.getByRole('button', { name: /^Agregar extra/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Extras para la cocina' })).toHaveCount(0)
})

test('"+ Extra" en el almuerzo del miércoles: 3 personas y una nota; la celda y Administración lo ven, sin nombres', async ({
  page,
}) => {
  const { lunesSiguiente, miercolesSiguiente } = fechas()
  await iniciarSesion(page, 'director')
  await page.goto(`/comidas/casa?semana=${lunesSiguiente}`)

  const mas = botonExtra(page, 'almuerzo', miercolesSiguiente)
  // En la esquina de la comida, con "Extra" escrito (nunca solo el +) y al lado de su botón, no dentro.
  await expect(mas).toContainText('Extra')
  await expect(page.locator(`.tabla-casa td[data-fecha="${miercolesSiguiente}"][data-comida="almuerzo"] .celda-casa .extra-mas`)).toHaveCount(0)
  await mas.click()
  await expect(mas).toHaveAttribute('aria-expanded', 'true')
  const burbuja = page.getByRole('dialog', { name: `Extras para el almuerzo del miércoles ${fechaCorta(miercolesSiguiente)}` })
  await expect(burbuja).toBeFocused()
  await burbuja.getByRole('button', { name: 'Una persona más' }).click()
  await burbuja.getByRole('button', { name: 'Una persona más' }).click()
  await expect(burbuja.getByLabel('¿Cuántas personas de más?')).toHaveValue('3')
  await burbuja.getByLabel('Nota para la cocina (si hace falta)').fill('Sin sal')
  await expect(burbuja.getByText('La cocina lee esta nota: no escribas nombres.')).toBeVisible()
  // Una comida de la semana siguiente no cerró: no hay aviso.
  await expect(burbuja.getByText('Esa comida ya cerró: la cocina puede no verlo a tiempo.')).toHaveCount(0)
  await burbuja.getByRole('button', { name: 'Agregar', exact: true }).click()

  await expect(page.getByText('Extra agregado. La cocina ya lo ve.')).toBeVisible()
  await expect(burbuja).toHaveCount(0)
  await expect(mas).toBeFocused()
  const celda = celdaCasa(page, miercolesSiguiente, 'almuerzo')
  await expect(celda).toContainText('+3 extra')
  await expect(celda).toContainText('3 extra: Sin sal')
  await expect
    .poll(async () => {
      const { data } = await clienteAdminPrueba()
        .from('extras_manuales')
        .select('fecha, tiempo_comida, cantidad, nota, creado_por')
        .eq('fecha', miercolesSiguiente)
      return data
    })
    .toEqual([{ fecha: miercolesSiguiente, tiempo_comida: 'almuerzo', cantidad: 3, nota: 'Sin sal', creado_por: ids.director }])

  // La burbuja lista los extras que ya tiene esa comida.
  await mas.click()
  await expect(burbuja.locator('.fila-extra')).toHaveCount(1)
  await expect(burbuja.locator('.fila-extra')).toContainText('3 personas')
  await expect(burbuja.locator('.fila-extra')).toContainText('Nota: Sin sal')
  await page.keyboard.press('Escape')
  await expect(burbuja).toHaveCount(0)

  await salir(page)
  await iniciarSesion(page, 'administracion')
  await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)
  const celdaCocina = page.locator(`.admin-week-table td[data-fecha="${miercolesSiguiente}"][data-comida="almuerzo"]`)
  await expect(celdaCocina).toContainText('+3 extra')
  await expect(celdaCocina).toContainText('3 extra: Sin sal')
  const html = await page.content()
  for (const nombre of nombresQueNoDebeVer('administracion')) expect(html).not.toContain(nombre)
})

test('en la burbuja del extra: lo escrito sin agregar pregunta antes de cerrarse, y "Quitar" saca un extra', async ({ page }) => {
  const { lunesSiguiente, miercolesSiguiente } = fechas()
  const admin = clienteAdminPrueba()
  const { error } = await admin
    .from('extras_manuales')
    .insert({ fecha: miercolesSiguiente, tiempo_comida: 'cena', cantidad: 2, nota: 'Vegetariano', creado_por: ids.director })
  expect(error).toBeNull()

  await iniciarSesion(page, 'director')
  await page.goto(`/comidas/casa?semana=${lunesSiguiente}`)
  const mas = botonExtra(page, 'cena', miercolesSiguiente)
  await mas.click()
  const burbuja = page.getByRole('dialog', { name: `Extras para la cena del miércoles ${fechaCorta(miercolesSiguiente)}` })

  // Algo escrito y un toque fuera: no se pierde en silencio, pregunta.
  await burbuja.getByRole('button', { name: 'Una persona más' }).click()
  await tocarFuera(page)
  await expect(burbuja).toBeVisible()
  await expect(burbuja.getByRole('alert')).toContainText('¿Agregar o descartar?')
  await burbuja.getByRole('button', { name: 'Descartar' }).click()
  await expect(burbuja).toHaveCount(0)
  await expect(mas).toBeFocused()

  // "Quitar", con confirmación, mientras la comida no cerró.
  await mas.click()
  const fila = burbuja.locator('.fila-extra')
  await expect(fila).toContainText('2 personas')
  await expect(fila).toContainText('Nota: Vegetariano')
  await fila.getByRole('button', { name: /^Quitar el extra: / }).click()
  await fila.getByRole('button', { name: 'Sí, quitar' }).click()
  await expect(page.getByText('Extra quitado. La cocina ya no lo cuenta.')).toBeVisible()
  await expect(burbuja.locator('.fila-extra')).toHaveCount(0)
  // Era el único: el foco va al título de la burbuja, nunca a la nada.
  await expect(burbuja.getByRole('heading', { level: 2 })).toBeFocused()
  await expect(celdaCasa(page, miercolesSiguiente, 'cena')).not.toContainText('+2 extra')
  await expect
    .poll(async () => {
      const { data } = await admin.from('extras_manuales').select('id').eq('fecha', miercolesSiguiente)
      return data
    })
    .toEqual([])
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

    test('La casa cabe sin scroll lateral, sus burbujas entran en la pantalla y todo lo que se toca mide al menos 56px', async ({
      page,
    }) => {
      const { lunesSiguiente } = fechas()
      await iniciarSesion(page, 'director')
      await page.goto(`/comidas/casa?semana=${lunesSiguiente}`)
      await esperarSinScrollLateral(page)
      // El "+ Extra" también: lo que se toca es el rincón entero (56×56), aunque la pastilla se vea chica.
      await esperarAltoMinimo(page.locator('.content button, .content a.tab-btn'))
      const anchos = await page.locator('.extra-mas').evaluateAll((botones) => botones.map((b) => b.getBoundingClientRect().width))
      expect(anchos.filter((ancho) => ancho < 55.5)).toEqual([])

      // El lunes: el más lejos de lo que se abre si el panel fuera al final de la tabla.
      await celdaCasa(page, lunesSiguiente, 'almuerzo').click()
      await expect(panelCasa(page).getByRole('heading', { level: 2 })).toBeInViewport()
      await expect(panelCasa(page).getByRole('heading', { level: 2 })).toBeFocused()
      await panelCasa(page).getByRole('button', { name: 'Residente Prueba' }).click()
      const burbuja = page.getByRole('dialog', { name: /^Almuerzo de Residente Prueba, lunes / })
      await esperarDentroDeLaPantalla(page, burbuja)
      await esperarSinScrollLateral(page)
      await esperarAltoMinimo(burbuja.getByRole('button'))
      await page.keyboard.press('Escape')
      await expect(burbuja).toHaveCount(0)

      await botonExtra(page, 'almuerzo', lunesSiguiente).click()
      const extras = page.getByRole('dialog', { name: /^Extras para el almuerzo del lunes / })
      await esperarDentroDeLaPantalla(page, extras)
      await esperarSinScrollLateral(page)
      await esperarAltoMinimo(extras.getByRole('button'))

      // Con la letra más grande, tampoco se sale.
      await page.evaluate(() => document.documentElement.setAttribute('data-texto', 'enorme'))
      await esperarDentroDeLaPantalla(page, extras)
      await esperarSinScrollLateral(page)
      await esperarAltoMinimo(extras.getByRole('button'))
    })
  })
}
