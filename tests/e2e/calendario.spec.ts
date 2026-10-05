import { expect, test, type Page } from '@playwright/test'
import { fechaISOEn, sumarDias } from '../../lib/fechas'
import { rangoLegible } from '../../lib/fechas/rango'
import {
  asegurarUsuariosPrueba,
  clienteAdminPrueba,
  CONTRASENA_PRUEBA,
  USUARIOS_PRUEBA,
  type ClaveUsuario,
} from '../soporte/usuarios-prueba'
import { esperarAltoMinimo, esperarSinScrollLateral } from '../soporte/medidas-e2e'
import { irAlMesDe, panelAusencias } from './soporte/ausencias'

async function iniciarSesion(page: Page, clave: ClaveUsuario) {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(USUARIOS_PRUEBA[clave].usuario)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
}

test.afterEach(async () => {
  const ids = await asegurarUsuariosPrueba()
  const admin = clienteAdminPrueba()
  const resultados = await Promise.all([
    admin.from('eventos').delete().in('creado_por', Object.values(ids)),
    admin.from('ausencias').delete().in('usuario_id', Object.values(ids)),
  ])
  for (const { error } of resultados) if (error) throw error
})

/** Último día del mes de `fecha`: nunca es anterior a ella, y el día siguiente ya es de otro mes. */
function ultimoDiaDelMes(fecha: string): string {
  let dia = fecha
  while (sumarDias(dia, 1).slice(0, 7) === fecha.slice(0, 7)) dia = sumarDias(dia, 1)
  return dia
}

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
  await modal.getByLabel('San Rafael').check()
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
  const materiales = modal.getByLabel('Utensilios y materiales', { exact: true })

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
  await modal.getByLabel('San Rafael', { exact: true }).check()
  await modal.getByLabel('Hora (opcional)').fill('16:00')
  await modal.getByRole('button', { name: 'Agregar evento' }).click()
  await expect(modal.getByText('Retiro con merienda')).toBeVisible()

  const { data } = await clienteAdminPrueba().from('eventos').select('tipo, requiere_cocina').eq('fecha', hoy).single()
  expect(data).toEqual({ tipo: 'san_rafael', requiere_cocina: ['merienda'] })
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
    .getByLabel('San Gabriel')
    .evaluate((radio) => (radio as HTMLInputElement).validity.valueMissing)
  expect(faltante).toBe(true)
  await expect(modal.getByText('Nuevo evento')).toBeVisible()
  const { data } = await clienteAdminPrueba().from('eventos').select('id').eq('fecha', hoy)
  expect(data).toEqual([])
})

test('Administración ve lo que la cocina debe preparar con la categoría del evento, sin título', async ({ page }) => {
  const ids = await asegurarUsuariosPrueba()
  const hoy = fechaISOEn(new Date())
  const { error } = await clienteAdminPrueba()
    .from('eventos')
    .insert([
      { titulo: 'Retiro secreto', fecha: hoy, hora: '16:00', tipo: 'san_rafael', requiere_cocina: ['merienda', 'comida'], creado_por: ids.director },
      { titulo: 'Reunión privada', fecha: hoy, hora: '09:00', tipo: 'san_gabriel', requiere_cocina: [], creado_por: ids.director },
    ])
  expect(error).toBeNull()

  await iniciarSesion(page, 'administracion')
  // Aunque el dispositivo tenga filtros guardados (lo usó antes alguien de la casa), a la cocina no le aplican…
  await page.evaluate(() => localStorage.setItem('molino-calendario', '{"ocultos":["san_rafael","sin_pedido"]}'))
  // …ni un instante: el HTML del servidor ya sale "listo", así el CSS previo a la hidratación no esconde nada.
  const respuesta = await page.request.get('/calendario')
  expect(await respuesta.text()).toMatch(/class="zona-calendario" data-listo=""/)
  await page.goto('/calendario')
  await expect(page.getByText('Lo que la casa necesita de la cocina')).toBeVisible()

  // Sin filtros: ni chips ni aviso de ocultos.
  await expect(page.getByRole('region', { name: 'Filtros' })).toHaveCount(0)
  await expect(page.getByRole('switch')).toHaveCount(0)
  await expect(page.locator('.chip-filtro, .aviso-filtros')).toHaveCount(0)

  // El pedido, con el color y la marca escrita de su categoría.
  const celdaHoy = page.locator(`.cal-day[data-fecha="${hoy}"]`)
  const evento = celdaHoy.locator('.cal-event')
  await expect(evento).toHaveText(['16:00 Merienda y comida'])
  await expect(evento).toBeVisible()
  await expect(evento).toHaveAttribute('data-tipo', 'san_rafael')
  await expect(evento).toHaveAttribute('data-marca', 'SR')
  await expect(celdaHoy).toHaveAttribute('aria-label', /, 1 pedido para la cocina: San Rafael$/)

  await celdaHoy.click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByText('Merienda y comida')).toBeVisible()
  await expect(modal.getByText('16:00')).toBeVisible()
  await expect(modal.locator('.pastilla-tipo')).toHaveText('San Rafael')
  // El pedido ya es el texto del evento: no se repite en pastillas.
  await expect(modal.locator('.pastilla-cocina')).toHaveCount(0)
  // El evento que no pide nada a la cocina no aparece, ni su hora.
  await expect(modal.getByText('09:00')).toHaveCount(0)
  await expect(modal.getByText(/ocultos? por los filtros/)).toHaveCount(0)

  // Ni los títulos ni la categoría del evento sin pedido llegan al navegador, ni en pantalla ni en los datos.
  const html = await page.content()
  for (const secreto of ['Retiro secreto', 'Reunión privada', 'San Gabriel', 'San Miguel', 'Estás ocultando']) {
    expect(html, `"${secreto}" no debería llegar a Administración`).not.toContain(secreto)
  }
  await expect(modal.getByLabel('Título del evento')).toHaveCount(0)
})

test('Administración ve el pedido libre aunque el evento no pida nada de la lista fija', async ({ page }) => {
  const ids = await asegurarUsuariosPrueba()
  const hoy = fechaISOEn(new Date())
  const { error } = await clienteAdminPrueba()
    .from('eventos')
    .insert({
      titulo: 'Visita con pedido especial',
      fecha: hoy,
      hora: '11:00',
      tipo: 'san_miguel',
      requiere_cocina: [],
      requiere_otro_texto: '20 sillas extra',
      creado_por: ids.director,
    })
  expect(error).toBeNull()

  await iniciarSesion(page, 'administracion')
  await page.goto('/calendario')
  await page.locator(`.cal-day[data-fecha="${hoy}"]`).click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByText('20 sillas extra')).toBeVisible()

  const html = await page.content()
  expect(html, '"Visita con pedido especial" no debería llegar a Administración').not.toContain('Visita con pedido especial')
})

test('el Director genera un enlace, alguien sin sesión confirma, y el Director lo ve y lo revoca', async ({ page, context }) => {
  const ids = await asegurarUsuariosPrueba()
  const hoy = fechaISOEn(new Date())
  // Sin `tipo`: queda 'otro' por default. No usamos 'san_rafael' a propósito — esa categoría solo
  // existe después de aplicar el plan de categorías, y este plan no depende de él (spec §6).
  const { data: evento, error } = await clienteAdminPrueba()
    .from('eventos')
    .insert({ titulo: 'San Rafael', fecha: hoy, creado_por: ids.director })
    .select('id')
    .single()
  expect(error).toBeNull()

  await iniciarSesion(page, 'director')
  await page.goto('/calendario')
  await page.locator(`.cal-day[data-fecha="${hoy}"]`).click()
  const modal = page.getByRole('dialog')
  await modal.getByRole('button', { name: 'Cena extra' }).click()

  const manana = fechaISOEn(new Date(Date.now() + 24 * 3_600_000))
  await modal.getByLabel('Vence el').fill(manana)
  await modal.getByLabel('Hora de vencimiento').fill('15:00')
  await modal.getByRole('button', { name: 'Generar enlace' }).click()

  const enlaceInput = modal.locator('.enlace-item input[readonly]')
  await expect(enlaceInput).toBeVisible()
  const url = await enlaceInput.inputValue()

  // Alguien sin sesión, en una pestaña aparte.
  const paginaPublica = await context.newPage()
  await paginaPublica.goto(url)
  await expect(paginaPublica.getByText('San Rafael')).toBeVisible()
  await paginaPublica.getByLabel('Tu nombre').fill('Familia Pérez')
  await paginaPublica.getByLabel(/Cuántas personas/).fill('3')
  await paginaPublica.getByRole('button', { name: 'Confirmar cena' }).click()
  await expect(paginaPublica.getByText('¡Listo! Tu cena quedó confirmada.')).toBeVisible()
  await paginaPublica.close()

  // El Director recarga y ve la confirmación.
  await page.reload()
  await page.locator(`.cal-day[data-fecha="${hoy}"]`).click()
  const modal2 = page.getByRole('dialog')
  await modal2.getByRole('button', { name: 'Cena extra' }).click()
  await expect(modal2.getByText('Familia Pérez (3)')).toBeVisible()
  await expect(modal2.getByText('3 personas confirmadas')).toBeVisible()

  await modal2.getByRole('button', { name: 'Revocar ahora' }).click()
  await expect(modal2.getByText('vencido')).toBeVisible()

  // Ya revocado, ya no acepta confirmaciones nuevas.
  const paginaPublica2 = await context.newPage()
  await paginaPublica2.goto(url)
  await expect(paginaPublica2.getByText('Este enlace ya venció.')).toBeVisible()
  await paginaPublica2.close()

  void evento
})

test('el Director crea una serie semanal, edita una ocurrencia puntual y cancela el resto', async ({ page }) => {
  await iniciarSesion(page, 'director')
  await page.goto('/calendario')
  const hoy = fechaISOEn(new Date())
  await page.locator(`.cal-day[data-fecha="${hoy}"]`).click()
  const modal = page.getByRole('dialog')

  await modal.getByLabel('Título del evento').fill('San Rafael')
  await modal.getByLabel('San Rafael', { exact: true }).check()
  await modal.getByLabel('Este evento se repite').check()
  await modal.getByLabel('Día de la semana').selectOption('6') // sábado
  const fechaFin = fechaISOEn(new Date(Date.now() + 45 * 86_400_000))
  await modal.getByLabel('Repetir hasta').fill(fechaFin)
  await modal.getByRole('button', { name: 'Agregar evento' }).click()
  await expect(page.getByText(/Se crearon \d+ eventos\./)).toBeVisible()

  const { data: eventos } = await clienteAdminPrueba().from('eventos').select('id, fecha, serie_id').eq('titulo', 'San Rafael').order('fecha')
  expect(eventos!.length).toBeGreaterThan(1)
  const serieId = eventos![0].serie_id
  expect(serieId).not.toBeNull()

  // Editar una ocurrencia puntual: no toca las demás. Navegar al mes de esa fecha por si cae
  // distinto al mes que se ve por defecto (mismo motivo que más abajo).
  const segunda = eventos![1]
  await page.goto(`/calendario?mes=${segunda.fecha.slice(0, 7)}`)
  await page.locator(`.cal-day[data-fecha="${segunda.fecha}"]`).click()
  const modal2 = page.getByRole('dialog')
  await modal2.getByRole('button', { name: /^Editar/ }).click()
  await modal2.getByLabel('Título del evento').fill('San Rafael (cambiado)')
  await modal2.getByRole('button', { name: 'Guardar cambios' }).click()
  const { data: primeraSinTocar } = await clienteAdminPrueba().from('eventos').select('titulo').eq('id', eventos![0].id).single()
  expect(primeraSinTocar!.titulo).toBe('San Rafael')

  // Cancelar la serie completa desde una ocurrencia real (la primera generada, no necesariamente
  // "hoy": el patrón es "cada sábado desde hoy", y hoy puede no ser sábado — navegar al mes de esa
  // fecha por si cae en el mes siguiente al que se ve por defecto).
  const primera = eventos![0].fecha
  await page.goto(`/calendario?mes=${primera.slice(0, 7)}`)
  await page.locator(`.cal-day[data-fecha="${primera}"]`).click()
  const modal3 = page.getByRole('dialog')
  await modal3.getByRole('button', { name: 'Cancelar toda la serie' }).click()
  await modal3.getByRole('button', { name: /Sí, cancelar la serie/ }).click()
  await expect(page.getByText(/Se cancelaron \d+ eventos futuros/)).toBeVisible()

  // La serie se creó con fecha_inicio = hoy, así que toda ocurrencia generada es >= hoy — el filtro
  // gte de eliminarSerieDesdeHoy las borra todas, no queda ninguna.
  const { data: quedan } = await clienteAdminPrueba().from('eventos').select('id').eq('serie_id', serieId!)
  expect(quedan).toEqual([])
})

test('un Residente marca en el mini calendario una ausencia que cruza de mes, la ve marcada y la quita', async ({ page }) => {
  const ids = await asegurarUsuariosPrueba()
  const hoy = fechaISOEn(new Date())
  const desde = ultimoDiaDelMes(hoy)
  const hasta = sumarDias(desde, 2)
  const rango = rangoLegible(desde, hasta)

  await iniciarSesion(page, 'residente')
  await page.goto('/calendario')
  const panel = panelAusencias(page)

  // El calendario va primero; las ausencias, debajo.
  const arribaCalendario = (await page.locator('.cal-head').boundingBox())!.y
  const arribaAusencias = (await panel.boundingBox())!.y
  expect(arribaCalendario).toBeLessThan(arribaAusencias)
  await expect(panel.getByText('No tenés ausencias marcadas.')).toBeVisible()

  const abrir = panel.getByRole('button', { name: 'Marcar una ausencia' })
  await abrir.click()
  await expect(abrir).toHaveAttribute('aria-expanded', 'true')
  const mini = panel.locator('.mini-calendario')
  const guardar = panel.getByRole('button', { name: 'Guardar ausencia' })
  await expect(guardar).toBeDisabled()

  // Primer toque: el último día de este mes; segundo: dos días después, ya en el mes siguiente.
  await mini.locator(`.mini-dia[data-fecha="${desde}"]`).click()
  await irAlMesDe(mini, hasta)
  await mini.locator(`.mini-dia[data-fecha="${hasta}"]`).click()
  await expect(mini.locator(`td:has(> .mini-dia[data-fecha="${hasta}"])`)).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByText(`Del ${rango} (3 días).`)).toBeVisible()

  await guardar.click()
  await expect(page.getByText('Ausencia marcada.')).toBeVisible()
  await expect(abrir).toHaveAttribute('aria-expanded', 'false')
  const quitar = panel.getByRole('button', { name: `Quitar la ausencia del ${rango}` })
  await expect(quitar).toBeVisible()
  const { data: guardadas } = await clienteAdminPrueba().from('ausencias').select('desde, hasta').eq('usuario_id', ids.residente)
  expect(guardadas).toEqual([{ desde, hasta }])

  // Marcada en los dos calendarios: el grande y el mini (con texto para el lector de pantalla).
  await expect(page.locator(`.cal-day[data-fecha="${desde}"]`)).toHaveClass(/\bausente\b/)
  await abrir.click()
  const diaMarcado = mini.locator(`.mini-dia[data-fecha="${desde}"]`)
  await expect(diaMarcado).toHaveClass(/\bmarcado\b/)
  await expect(diaMarcado).toHaveAccessibleName(/, ya marcado como ausente$/)
  // Tocar un día ya marcado no lo desmarca ni lo duplica: no hay nada que guardar, y se quita con «Quitar».
  await diaMarcado.click()
  await expect(panel.getByText('Ese día ya lo tenés marcado. Para quitarlo, usá «Quitar» arriba.')).toBeVisible()
  await expect(guardar).toBeDisabled()
  await panel.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(abrir).toBeFocused()

  // Quitar, con su confirmación de siempre.
  await quitar.click()
  await panel.getByRole('button', { name: 'Sí, quitar' }).click()
  await expect(page.getByText('Ausencia quitada.')).toBeVisible()
  await expect(panel.getByText('No tenés ausencias marcadas.')).toBeVisible()
  const { data: quedan } = await clienteAdminPrueba().from('ausencias').select('id').eq('usuario_id', ids.residente)
  expect(quedan).toEqual([])
})

test('en el mini calendario los días pasados no se tocan y el teclado no sale de hoy', async ({ page }) => {
  const ids = await asegurarUsuariosPrueba()
  const hoy = fechaISOEn(new Date())
  const ayer = sumarDias(hoy, -1)
  const manana = sumarDias(hoy, 1)

  await iniciarSesion(page, 'director')
  await page.goto('/calendario')
  const panel = panelAusencias(page)
  await panel.getByRole('button', { name: 'Marcar una ausencia' }).click()
  const mini = panel.locator('.mini-calendario')

  // No se puede ir antes del mes de hoy, y lo que ya pasó está deshabilitado.
  await expect(mini.getByRole('button', { name: 'Ir al mes anterior' })).toHaveAttribute('aria-disabled', 'true')
  if (ayer.slice(0, 7) === hoy.slice(0, 7)) await expect(mini.locator(`.mini-dia[data-fecha="${ayer}"]`)).toBeDisabled()
  else await expect(mini.locator(`.mini-dia[data-fecha="${ayer}"]`)).toHaveCount(0)
  const celdaHoy = mini.locator(`.mini-dia[data-fecha="${hoy}"]`)
  await expect(celdaHoy).toBeEnabled()
  await expect(celdaHoy).toHaveAttribute('aria-current', 'date')
  // Un solo punto de tabulación en todo el mes: hoy.
  await expect(mini.locator('.mini-dia[tabindex="0"]')).toHaveCount(1)
  await expect(celdaHoy).toHaveAttribute('tabindex', '0')

  // Flechas: a la izquierda no pasa de hoy; a la derecha, mañana (aunque sea de otro mes). Enter elige.
  await celdaHoy.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(celdaHoy).toBeFocused()
  await page.keyboard.press('ArrowRight')
  const celdaManana = mini.locator(`.mini-dia[data-fecha="${manana}"]`)
  await expect(celdaManana).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(mini.locator(`td:has(> .mini-dia[data-fecha="${manana}"])`)).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByText(`El ${rangoLegible(manana, manana)}: un solo día.`)).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Guardar ausencia' })).toBeEnabled()

  // Nada se guarda sin "Guardar ausencia".
  await panel.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(mini).toHaveCount(0)
  const { data } = await clienteAdminPrueba().from('ausencias').select('id').eq('usuario_id', ids.director)
  expect(data).toEqual([])
})

test('Administración no tiene ausencias en el calendario: ni tarjeta, ni mini calendario, ni días marcados', async ({ page }) => {
  const ids = await asegurarUsuariosPrueba()
  const hoy = fechaISOEn(new Date())
  const { error } = await clienteAdminPrueba().from('ausencias').insert({ usuario_id: ids.residente, desde: hoy, hasta: hoy })
  expect(error).toBeNull()

  await iniciarSesion(page, 'administracion')
  await page.goto('/calendario')
  await expect(page.locator('.cal-head')).toBeVisible()
  await expect(page.getByText('Mis ausencias')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Marcar una ausencia' })).toHaveCount(0)
  await expect(page.locator('.mini-calendario')).toHaveCount(0)
  await expect(page.locator('.cal-day.ausente')).toHaveCount(0)
})

/** La sección "Filtros" del calendario (Director y Residente). */
function seccionFiltros(page: Page) {
  return page.getByRole('region', { name: 'Filtros' })
}

test('el Director ve los filtros con el color de cada tipo, oculta San Miguel, se recuerda al recargar y «Mostrar todo» lo devuelve', async ({
  page,
}) => {
  const ids = await asegurarUsuariosPrueba()
  const hoy = fechaISOEn(new Date())
  const { error } = await clienteAdminPrueba()
    .from('eventos')
    .insert([
      { titulo: 'Misa filtrable', fecha: hoy, hora: '08:00', tipo: 'san_miguel', requiere_cocina: [], creado_por: ids.director },
      { titulo: 'Charla a la vista', fecha: hoy, hora: '10:00', tipo: 'san_rafael', requiere_cocina: ['merienda'], creado_por: ids.director },
    ])
  expect(error).toBeNull()

  await iniciarSesion(page, 'director')
  await page.goto('/calendario')
  const filtros = seccionFiltros(page)
  await expect(filtros).toBeVisible()

  // Los cuatro tipos, cada uno con su color (distinto) y su marca, más "Mis ausencias": todos a la vista.
  const chips = ['San Rafael', 'San Gabriel', 'San Miguel', 'Otro', 'Mis ausencias'].map((nombre) =>
    filtros.getByRole('button', { name: nombre, exact: true }),
  )
  for (const chip of chips) await expect(chip).toHaveAttribute('aria-pressed', 'true')
  await expect(chips[2]).toHaveAttribute('style', /--ev:\s*var\(--ev-san-miguel\)/)
  const colores = await filtros
    .locator('.marca-tipo')
    .evaluateAll((marcas) => marcas.map((m) => getComputedStyle(m).backgroundColor))
  expect(new Set(colores).size).toBe(4)
  const soloCocina = filtros.getByRole('switch', { name: 'Solo eventos con pedido a cocina' })
  await expect(soloCocina).toHaveAttribute('aria-checked', 'false')

  // En la cuadrícula, cada evento con su marca (la sigla va por CSS: el texto del evento no cambia).
  const celdaHoy = page.locator(`.cal-day[data-fecha="${hoy}"]`)
  await expect(celdaHoy.locator('.cal-event')).toHaveText(['08:00 Misa filtrable', '10:00 Charla a la vista'])
  await expect(celdaHoy.locator('.cal-event[data-marca="SM"]')).toHaveCount(1)
  await expect(celdaHoy).toHaveAttribute('aria-label', /, 2 eventos: San Miguel y San Rafael$/)

  // Ocultar San Miguel: el chip queda "Oculto", el evento se va y el aviso lo dice.
  await chips[2].click()
  await expect(chips[2]).toHaveAttribute('aria-pressed', 'false')
  await expect(chips[2]).toContainText('Oculto')
  await expect(celdaHoy.locator('.cal-event')).toHaveText(['10:00 Charla a la vista'])
  await expect(celdaHoy).toHaveAttribute('aria-label', /, 1 evento: San Rafael, 1 oculto por los filtros$/)
  await expect(page.getByText('Estás ocultando: San Miguel.')).toBeVisible()

  // Se recuerda en este dispositivo.
  await page.reload()
  await expect(chips[2]).toHaveAttribute('aria-pressed', 'false')
  await expect(celdaHoy.locator('.cal-event')).toHaveText(['10:00 Charla a la vista'])
  await expect(page.getByText('Estás ocultando: San Miguel.')).toBeVisible()

  // En el día, lo oculto se avisa y se puede ver sin cambiar los filtros.
  await celdaHoy.click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByText('Hay 1 evento oculto por los filtros.')).toBeVisible()
  await expect(modal.getByText('Misa filtrable')).toHaveCount(0)
  await modal.getByRole('button', { name: 'Mostrarlo' }).click()
  await expect(modal.getByText('Misa filtrable')).toBeVisible()
  await expect(modal.getByText('Oculto por los filtros')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(chips[2]).toHaveAttribute('aria-pressed', 'false')

  // "Mostrar todo" vuelve todo a la vista, y el foco no se pierde.
  await page.getByRole('button', { name: 'Mostrar todo' }).click()
  await expect(chips[2]).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/^Estás ocultando/)).toHaveCount(0)
  await expect(celdaHoy.locator('.cal-event')).toHaveCount(2)
  await expect(chips[0]).toBeFocused()
})

test('con San Miguel oculto, un evento de San Miguel recién agregado se ve en el día y el aviso explica por qué no está en el calendario', async ({
  page,
}) => {
  const hoy = fechaISOEn(new Date())
  await iniciarSesion(page, 'director')
  await page.goto('/calendario')
  const chipSanMiguel = seccionFiltros(page).getByRole('button', { name: 'San Miguel', exact: true })
  await chipSanMiguel.click()
  await expect(chipSanMiguel).toHaveAttribute('aria-pressed', 'false')

  const celdaHoy = page.locator(`.cal-day[data-fecha="${hoy}"]`)
  await celdaHoy.click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('Título del evento').fill('Misa recién cargada')
  await modal.getByLabel('San Miguel', { exact: true }).check()
  await modal.getByRole('button', { name: 'Agregar evento' }).click()

  // No "desaparece": está en la lista del día, marcado como oculto, y el aviso dice por qué.
  await expect(page.locator('.toast')).toHaveText(
    'Evento agregado. No se ve en el calendario porque «San Miguel» está oculto en los filtros.',
  )
  await expect(modal.getByText('Misa recién cargada')).toBeVisible()
  await expect(modal.getByText('Oculto por los filtros')).toBeVisible()
  await expect(modal.getByText(/ocultos? por los filtros\.$/)).toHaveCount(0)
  await expect(celdaHoy.locator('.cal-event')).toHaveCount(0)

  // Desde ahí mismo se vuelve a mostrar San Miguel en el calendario.
  await modal.getByRole('button', { name: 'Mostrar San Miguel en el calendario' }).click()
  await expect(modal.getByText('Oculto por los filtros')).toHaveCount(0)
  await expect(modal).toBeFocused()
  await expect(chipSanMiguel).toHaveAttribute('aria-pressed', 'true')
  await expect(celdaHoy.locator('.cal-event')).toHaveText(['Misa recién cargada'])
})

test('«Solo eventos con pedido a cocina» deja los que piden algo, también por texto libre', async ({ page }) => {
  const ids = await asegurarUsuariosPrueba()
  const hoy = fechaISOEn(new Date())
  const { error } = await clienteAdminPrueba()
    .from('eventos')
    .insert([
      { titulo: 'Con merienda', fecha: hoy, hora: '09:00', tipo: 'san_rafael', requiere_cocina: ['merienda'], creado_por: ids.director },
      { titulo: 'Sin pedido', fecha: hoy, hora: '10:00', tipo: 'otro', requiere_cocina: [], creado_por: ids.director },
      { titulo: 'Con sillas', fecha: hoy, hora: '11:00', tipo: 'san_gabriel', requiere_cocina: [], requiere_otro_texto: '10 sillas', creado_por: ids.director },
    ])
  expect(error).toBeNull()

  await iniciarSesion(page, 'director')
  await page.goto('/calendario')
  const celdaHoy = page.locator(`.cal-day[data-fecha="${hoy}"]`)
  await expect(celdaHoy.locator('.cal-event')).toHaveCount(3)

  const soloCocina = seccionFiltros(page).getByRole('switch', { name: 'Solo eventos con pedido a cocina' })
  await soloCocina.click()
  await expect(soloCocina).toHaveAttribute('aria-checked', 'true')
  await expect(celdaHoy.locator('.cal-event')).toHaveText(['09:00 Con merienda', '11:00 Con sillas'])
  await expect(page.getByText('Estás ocultando: los eventos sin pedido a cocina.')).toBeVisible()

  await soloCocina.click()
  await expect(celdaHoy.locator('.cal-event')).toHaveCount(3)
})

test('un Residente también filtra, y «Mis ausencias» quita las marcas de sus ausencias del calendario', async ({ page }) => {
  const ids = await asegurarUsuariosPrueba()
  const hoy = fechaISOEn(new Date())
  const resultados = await Promise.all([
    clienteAdminPrueba().from('ausencias').insert({ usuario_id: ids.residente, desde: hoy, hasta: hoy }),
    clienteAdminPrueba().from('eventos').insert({ titulo: 'Tertulia', fecha: hoy, hora: '19:00', tipo: 'san_gabriel', creado_por: ids.director }),
  ])
  for (const { error } of resultados) expect(error).toBeNull()

  await iniciarSesion(page, 'residente')
  await page.goto('/calendario')
  const filtros = seccionFiltros(page)
  for (const nombre of ['San Rafael', 'San Gabriel', 'San Miguel', 'Otro', 'Mis ausencias']) {
    await expect(filtros.getByRole('button', { name: nombre, exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
  await expect(filtros.getByRole('switch', { name: 'Solo eventos con pedido a cocina' })).toBeVisible()

  const celdaHoy = page.locator(`.cal-day[data-fecha="${hoy}"]`)
  await expect(celdaHoy).toHaveClass(/\bausente\b/)
  await filtros.getByRole('button', { name: 'Mis ausencias', exact: true }).click()
  await expect(celdaHoy).not.toHaveClass(/\bausente\b/)
  await expect(celdaHoy.locator('.cal-ausente-icono')).toHaveCount(0)
  await expect(page.getByText('Estás ocultando: Mis ausencias.')).toBeVisible()
  // Los eventos siguen; y la tarjeta "Mis ausencias" de abajo no se toca.
  await expect(celdaHoy.locator('.cal-event')).toHaveText(['19:00 Tertulia'])
  await expect(panelAusencias(page).getByRole('button', { name: /^Quitar la ausencia del / })).toHaveCount(1)
})

test.describe('en un teléfono de 375px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('los filtros van detrás de «Filtros», los chips bajan de línea sin scroll lateral, miden 56px y ninguna letra baja de --t-xs', async ({
    page,
  }) => {
    await iniciarSesion(page, 'director')
    await page.goto('/calendario')
    const filtros = seccionFiltros(page)
    const abrir = filtros.getByRole('button', { name: /^Filtros/ })
    await expect(abrir).toHaveAttribute('aria-expanded', 'false')
    await expect(filtros.getByRole('button', { name: 'San Miguel', exact: true })).toBeHidden()

    await abrir.click()
    await expect(abrir).toHaveAttribute('aria-expanded', 'true')
    const chips = filtros.locator('.chip-filtro')
    await expect(chips).toHaveCount(6)
    await esperarSinScrollLateral(page)
    await esperarAltoMinimo(filtros.locator('button'))
    const bordes = await chips.evaluateAll((lista) => lista.map((c) => c.getBoundingClientRect().right))
    expect(Math.max(...bordes)).toBeLessThanOrEqual(375)

    // Ninguna letra de los filtros (tampoco la sigla, que va por CSS) por debajo de --t-xs.
    const { minima, piso } = await filtros.evaluate((seccion) => {
      const piso = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.875
      let minima = Infinity
      for (const el of seccion.querySelectorAll('*')) {
        if (!el.getClientRects().length) continue
        const conTexto = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
        if (conTexto) minima = Math.min(minima, parseFloat(getComputedStyle(el).fontSize))
        const antes = getComputedStyle(el, '::before').content
        if (antes && !['none', 'normal', '""'].includes(antes)) minima = Math.min(minima, parseFloat(getComputedStyle(el, '::before').fontSize))
      }
      return { minima, piso }
    })
    expect(minima).toBeGreaterThanOrEqual(piso - 0.01)

    // Ocultar uno desde el teléfono: el aviso se ve con el panel cerrado, y la cuadrícula tampoco desborda.
    await filtros.getByRole('button', { name: 'Otro', exact: true }).click()
    await abrir.click()
    await expect(page.getByText('Estás ocultando: Otro.')).toBeVisible()
    await expect(abrir).toContainText('1 oculto')
    await page.getByRole('button', { name: 'Ver mes' }).click()
    await esperarSinScrollLateral(page)
  })
})
