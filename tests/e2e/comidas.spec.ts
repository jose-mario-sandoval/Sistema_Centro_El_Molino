import { expect, test, type Locator, type Page } from '@playwright/test'
import { fechaISOEn, lunesDe, sumarDias } from '../../lib/fechas'
import {
  asegurarUsuariosPrueba,
  clienteAdminPrueba,
  CONTRASENA_PRUEBA,
  nombresQueNoDebeVer,
  USUARIOS_PRUEBA,
  type ClaveUsuario,
} from '../soporte/usuarios-prueba'

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

/**
 * Cada comida muestra su estado actual como un botón grande; las seis opciones aparecen al tocarlo.
 * Las opciones se buscan con `exact`: el botón del estado se llama igual más ", cambiar".
 */
async function abrirOpciones(fila: Locator) {
  await fila.locator('.estado-actual').click()
  await expect(fila.locator('.estado-actual')).toHaveAttribute('aria-expanded', 'true')
}

/** Administración solo ve siglas: ningún nombre ajeno en pantalla ni en el HTML (datos de hidratación incluidos). */
async function sinNombresAjenos(page: Page, clave: ClaveUsuario) {
  const html = await page.content()
  for (const nombre of nombresQueNoDebeVer(clave)) {
    expect(html, `"${nombre}" no debería llegar al navegador de ${clave}`).not.toContain(nombre)
  }
}

async function iniciarSesion(page: Page, clave: ClaveUsuario) {
  await page.goto('/login')
  await page.getByLabel('Correo').fill(USUARIOS_PRUEBA[clave].correo)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
}

/** Borra planes y selecciones de los usuarios de prueba y deja horas límite y cierres futuros limpios. */
async function limpiar(): Promise<Record<ClaveUsuario, string>> {
  const usuarios = await asegurarUsuariosPrueba()
  const admin = clienteAdminPrueba()
  const resultados = await Promise.all([
    admin.from('selecciones_comida').delete().in('usuario_id', Object.values(usuarios)),
    admin.from('plan_semanal').delete().in('usuario_id', Object.values(usuarios)),
    admin.from('horas_limite').update({ dia_relativo: -1, hora: '21:00' }).eq('comida', 'desayuno'),
    admin.from('horas_limite').update({ dia_relativo: 0, hora: '10:00' }).eq('comida', 'almuerzo'),
    admin.from('horas_limite').update({ dia_relativo: 0, hora: '16:00' }).eq('comida', 'cena'),
    admin.from('comidas_cerradas').delete().gte('fecha', fechas().lunesSiguiente),
  ])
  for (const { error } of resultados) if (error) throw error
  return usuarios
}

async function planAlmuerzoMiercoles() {
  const { error } = await clienteAdminPrueba()
    .from('plan_semanal')
    .insert({ usuario_id: ids.residente, dia_semana: 3, comida: 'almuerzo', estado: 'si', nota: null })
  expect(error).toBeNull()
}

test.beforeEach(async () => {
  ids = await limpiar()
})

test.afterEach(async () => {
  await limpiar()
})

test('un residente cambia el almuerzo y Administración lo ve en Semana', async ({ page }) => {
  const { lunesSiguiente, miercolesSiguiente } = fechas()
  await planAlmuerzoMiercoles()

  // Residente
  await iniciarSesion(page, 'residente')
  await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)
  const almuerzo = page.locator(`[data-fecha="${miercolesSiguiente}"][data-comida="almuerzo"]`)
  await expect(almuerzo.getByText('según tu plan', { exact: true })).toBeVisible()
  await expect(almuerzo.locator('.estado-actual')).toContainText('Sí comer')
  await abrirOpciones(almuerzo)
  await expect(almuerzo.getByRole('button', { name: 'Sí comer', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await almuerzo.getByRole('button', { name: 'Comer tarde', exact: true }).click()
  await almuerzo.getByLabel('Hora', { exact: true }).fill('13:30')
  await almuerzo.getByRole('button', { name: 'Guardar' }).click()

  await expect(almuerzo.getByText('cambiada', { exact: true })).toBeVisible()
  await expect(almuerzo.getByText('Hora: 13:30')).toBeVisible()
  await expect(almuerzo.getByRole('button', { name: 'Comer tarde', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(almuerzo.locator('.estado-actual')).toContainText('Comer tarde')

  const admin = clienteAdminPrueba()
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('selecciones_comida')
        .select('estado, nota, origen')
        .eq('usuario_id', ids.residente)
        .eq('fecha', miercolesSiguiente)
        .eq('comida', 'almuerzo')
      return data
    })
    .toEqual([{ estado: 'tarde', nota: '13:30', origen: 'persona' }])

  // Administración
  await page.context().clearCookies()
  await iniciarSesion(page, 'administracion')
  await page.goto(`/comidas/semana?semana=${lunesSiguiente}&dia=${miercolesSiguiente}`)
  await expect(page.getByRole('link', { name: `Mié ${fechaCorta(miercolesSiguiente)}`, exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  )

  const resumen = page.locator('[data-resumen="almuerzo"]')
  await expect(resumen).toContainText('1 tarde (13:30)')
  await expect(resumen).toContainText('sin definir')

  // Administración ve siglas (RP), no nombres.
  const celda = page.getByRole('row', { name: /^RP\b/ }).locator('td[data-comida="almuerzo"]')
  await expect(celda).toContainText('Comer tarde')
  await expect(celda).toContainText('13:30')
  await expect(celda).toHaveClass(/\bexcepcion\b/)

  const celdaDirectora = page.getByRole('row', { name: /^DP\b/ }).locator('td[data-comida="almuerzo"]')
  await expect(celdaDirectora).toContainText('Sin definir')
  await sinNombresAjenos(page, 'administracion')
})

test('Administración ve siglas y no nombres en Semana y en Plan semanal', async ({ page }) => {
  await planAlmuerzoMiercoles()
  await iniciarSesion(page, 'administracion')

  await page.goto('/comidas/semana')
  await expect(page.getByRole('row', { name: /^RP\b/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /^DP\b/ })).toBeVisible()
  await sinNombresAjenos(page, 'administracion')

  await page.goto('/comidas/plan')
  await expect(page.getByRole('row', { name: /^RP\b/ })).toBeVisible()
  await sinNombresAjenos(page, 'administracion')
})

test('en una semana pasada el residente no puede cambiar nada', async ({ page }) => {
  const { lunesPasado } = fechas()

  await iniciarSesion(page, 'residente')
  await page.goto(`/comidas/semana?semana=${lunesPasado}`)

  await expect(page.locator('.locked-banner')).toContainText('Semana pasada: solo consulta.')
  // Cada comida cerrada muestra su estado sin poder abrir las opciones.
  await expect(page.locator('.week-list .estado-actual')).toHaveCount(7 * 3)
  await expect(page.locator('.week-list .estado-actual:enabled')).toHaveCount(0)
  await expect(page.locator('.week-list .status-chip')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Volver a mi plan' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ir a la semana actual' })).toBeVisible()
})

test('"Volver a mi plan" quita el cambio y restaura el plan', async ({ page }) => {
  const { lunesSiguiente, miercolesSiguiente } = fechas()
  await planAlmuerzoMiercoles()
  const admin = clienteAdminPrueba()
  const { error } = await admin.from('selecciones_comida').insert({
    usuario_id: ids.residente,
    fecha: miercolesSiguiente,
    comida: 'almuerzo',
    estado: 'no',
    nota: null,
    origen: 'persona',
  })
  expect(error).toBeNull()

  await iniciarSesion(page, 'residente')
  await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)
  const almuerzo = page.locator(`[data-fecha="${miercolesSiguiente}"][data-comida="almuerzo"]`)
  await expect(almuerzo.getByText('cambiada', { exact: true })).toBeVisible()
  await abrirOpciones(almuerzo)
  await expect(almuerzo.getByRole('button', { name: 'No comer', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await almuerzo.getByRole('button', { name: 'Volver a mi plan' }).click()

  await expect(almuerzo.getByText('según tu plan', { exact: true })).toBeVisible()
  await expect(almuerzo.getByRole('button', { name: 'Sí comer', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(almuerzo.getByRole('button', { name: 'Volver a mi plan' })).toHaveCount(0)
  // Filtramos por fecha y comida del caso: el job de cierre de cada 5 minutos puede
  // insertar selecciones de otras comidas para este usuario y volver flaky el poll.
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('selecciones_comida')
        .select('estado')
        .eq('usuario_id', ids.residente)
        .eq('fecha', miercolesSiguiente)
        .eq('comida', 'almuerzo')
      return data
    })
    .toEqual([])
})
