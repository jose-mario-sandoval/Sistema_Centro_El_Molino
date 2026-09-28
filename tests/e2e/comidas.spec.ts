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
import { marcarAusencia } from './soporte/ausencias'

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

/** Celda de una comida en la Semana de Administración (un día por fila, una comida por columna). */
function celdaSemana(page: Page, fecha: string, comida: 'desayuno' | 'almuerzo' | 'cena'): Locator {
  return page.locator(`.admin-week-table td[data-fecha="${fecha}"][data-comida="${comida}"]`)
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
    admin.from('ausencias').delete().in('usuario_id', Object.values(usuarios)),
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

  // Administración: ve el agregado del miércoles y cómo se come, sin filas por persona.
  await page.context().clearCookies()
  await iniciarSesion(page, 'administracion')
  await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)

  const celdaAlmuerzo = celdaSemana(page, miercolesSiguiente, 'almuerzo')
  await expect(celdaAlmuerzo).toBeVisible()
  // Solo el residente que eligió "tarde" come ese almuerzo; la cocina ve a qué hora.
  await expect(celdaAlmuerzo.locator('.conteo-numero')).toHaveText('1')
  await expect(celdaAlmuerzo.getByText('1 tarde (13:30)', { exact: true })).toBeVisible()

  await expect(page.locator('.admin-week-table')).not.toContainText('Persona')
  await expect(page.getByRole('row', { name: /^RP\b/ })).toHaveCount(0)
  await sinNombresAjenos(page, 'administracion')
})

test('Administración no ve ninguna sigla ni fila por persona en Semana ni en Plan semanal', async ({ page }) => {
  await planAlmuerzoMiercoles()
  await iniciarSesion(page, 'administracion')

  await page.goto('/comidas/semana')
  await expect(page.getByRole('row', { name: /^RP\b/ })).toHaveCount(0)
  await expect(page.getByRole('row', { name: /^DP\b/ })).toHaveCount(0)
  await sinNombresAjenos(page, 'administracion')

  await page.goto('/comidas/plan')
  await expect(page.getByRole('row', { name: /^RP\b/ })).toHaveCount(0)
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

test('una persona marca su ausencia: sus comidas se cancelan solas, puede reactivar una y al quitarla vuelve su plan', async ({
  page,
}) => {
  const { lunesSiguiente, miercolesSiguiente } = fechas()
  await planAlmuerzoMiercoles()
  await iniciarSesion(page, 'residente')

  // Marca su ausencia desde el mini calendario de /calendario: para un solo día, un toque alcanza.
  await page.goto('/calendario')
  await marcarAusencia(page, miercolesSiguiente)
  await expect(page.getByText('Ausencia marcada.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Quitar la ausencia del / })).toBeVisible()

  // Sus comidas de ese día quedaron canceladas por la ausencia, y el día lo dice.
  await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)
  const almuerzo = page.locator(`[data-fecha="${miercolesSiguiente}"][data-comida="almuerzo"]`)
  await expect(almuerzo.getByText('por tu ausencia', { exact: true })).toBeVisible()
  await expect(almuerzo.locator('.estado-actual')).toContainText('No comer')
  await expect(page.getByLabel(new RegExp(`^Miércoles ${fechaCorta(miercolesSiguiente)}`)).getByText('Ausente')).toBeVisible()

  // Puede reactivar una comida puntual: su elección gana sobre la ausencia.
  await abrirOpciones(almuerzo)
  await almuerzo.getByRole('button', { name: 'Sí comer', exact: true }).click()
  await expect(almuerzo.getByText('cambiada', { exact: true })).toBeVisible()
  await expect(almuerzo.locator('.estado-actual')).toContainText('Sí comer')

  // "Volver a mi ausencia" la devuelve a "No comer" por la ausencia (no a su plan).
  await almuerzo.getByRole('button', { name: 'Volver a mi ausencia' }).click()
  await expect(almuerzo.getByText('por tu ausencia', { exact: true })).toBeVisible()
  await expect(almuerzo.locator('.estado-actual')).toContainText('No comer')

  // Al quitar la ausencia vuelve a regir su plan semanal.
  await page.goto('/calendario')
  await page.getByRole('button', { name: /^Quitar la ausencia del / }).click()
  await page.getByRole('button', { name: 'Sí, quitar' }).click()
  await expect(page.getByText('Ausencia quitada.')).toBeVisible()

  await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)
  await expect(almuerzo.getByText('según tu plan', { exact: true })).toBeVisible()
  await expect(almuerzo.locator('.estado-actual')).toContainText('Sí comer')
})

test('Administración ve "No comer" de quien está ausente, sin saber que es una ausencia', async ({ page }) => {
  const { lunesSiguiente, miercolesSiguiente } = fechas()
  await planAlmuerzoMiercoles()
  const { error } = await clienteAdminPrueba()
    .from('ausencias')
    .insert({ usuario_id: ids.residente, desde: miercolesSiguiente, hasta: miercolesSiguiente })
  expect(error).toBeNull()

  await iniciarSesion(page, 'administracion')
  await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)
  const celdaAlmuerzo = celdaSemana(page, miercolesSiguiente, 'almuerzo')
  // El residente ausente cuenta como "no" (no suma) y el director no tiene plan ese día ("sin
  // definir", tampoco suma): el total que come queda en 0, sin exponer que fue por una ausencia.
  await expect(celdaAlmuerzo.locator('.conteo-numero')).toHaveText('0')
  await expect(celdaAlmuerzo.getByText('1 no come', { exact: true })).toBeVisible()

  // Las ausencias son privadas: la cocina ve el efecto, nunca el motivo ni las fechas.
  expect(await page.content()).not.toMatch(/ausen/i)
  await page.goto('/calendario')
  await expect(page.getByText('Mis ausencias')).toHaveCount(0)
})

test('Administración ve en Plan semanal cuántos comen y cómo, sin nombres', async ({ page }) => {
  const { error } = await clienteAdminPrueba()
    .from('plan_semanal')
    .insert([
      { usuario_id: ids.residente, dia_semana: 3, comida: 'almuerzo', estado: 'temprano', nota: '11:30' },
      { usuario_id: ids.residente2, dia_semana: 3, comida: 'almuerzo', estado: 'bolsa', nota: null },
      { usuario_id: ids.director, dia_semana: 3, comida: 'almuerzo', estado: 'no', nota: null },
    ])
  expect(error).toBeNull()

  await iniciarSesion(page, 'administracion')
  await page.goto('/comidas/plan')
  const celda = page.locator('.admin-week-table td[data-dia="3"][data-comida="almuerzo"]')
  await expect(celda.locator('.conteo-numero')).toHaveText('2')
  // Primero lo que cambia la preparación; "sin definir" (quien no tiene plan) al final.
  await expect(celda.locator('.parte')).toHaveText(['1 temprano (11:30)', '1 en bolsa', '1 no come', /^\d+ sin definir$/])

  await expect(page.locator('.admin-week-table')).not.toContainText('Persona')
  await sinNombresAjenos(page, 'administracion')
})

test.describe('en el teléfono', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('la Semana de Administración se apila en fichas por día, sin scroll lateral', async ({ page }) => {
    const { lunesSiguiente, miercolesSiguiente } = fechas()
    const { error } = await clienteAdminPrueba()
      .from('plan_semanal')
      .insert([
        { usuario_id: ids.residente, dia_semana: 3, comida: 'almuerzo', estado: 'tarde', nota: '13:30' },
        { usuario_id: ids.residente2, dia_semana: 3, comida: 'almuerzo', estado: 'bolsa', nota: null },
      ])
    expect(error).toBeNull()

    await iniciarSesion(page, 'administracion')
    await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)
    const celda = celdaSemana(page, miercolesSiguiente, 'almuerzo')
    await expect(celda.getByText('1 tarde (13:30)', { exact: true })).toBeVisible()
    await expect(celda.getByText('1 en bolsa', { exact: true })).toBeVisible()
    // Apilada: sin la fila de encabezados; cada celda lleva escrita su comida.
    await expect(page.locator('.admin-week-table thead')).toBeHidden()

    // Letra normal = sin atributo (así lo deja lib/apariencia.ts), y la más grande.
    for (const texto of [null, 'enorme'] as const) {
      await page.evaluate((valor) => {
        if (valor === null) document.documentElement.removeAttribute('data-texto')
        else document.documentElement.setAttribute('data-texto', valor)
      }, texto)
      const sobra = await page.evaluate(() => {
        const tarjeta = document.querySelector('.admin-table-scroll')
        return {
          pagina: document.documentElement.scrollWidth - window.innerWidth,
          // La tarjeta tiene overflow-x:auto: si la tabla no cabe, se desplaza adentro sin
          // ensanchar la página, así que también hay que medirla a ella.
          tarjeta: tarjeta ? tarjeta.scrollWidth - tarjeta.clientWidth : Number.NaN,
        }
      })
      expect(sobra.pagina, `scroll lateral de la página con letra ${texto ?? 'normal'}`).toBeLessThanOrEqual(0)
      expect(sobra.tarjeta, `scroll lateral dentro de la tabla con letra ${texto ?? 'normal'}`).toBeLessThanOrEqual(0)
    }
    await sinNombresAjenos(page, 'administracion')
  })
})
