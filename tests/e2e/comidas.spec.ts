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
import {
  esperarAltoMinimo,
  esperarDentroDeLaPantalla,
  esperarFocoALaVista,
  esperarSinScrollLateral,
} from '../soporte/medidas-e2e'

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

type Comida = 'desayuno' | 'almuerzo' | 'cena'
const NOMBRE_COMIDA: Record<Comida, string> = { desayuno: 'Desayuno', almuerzo: 'Almuerzo', cena: 'Cena' }

/**
 * El botón de una comida en la tarjeta de su día (Semana). Su nombre accesible dice cuál es, qué
 * tiene y qué hace tocarlo: 'Almuerzo del miércoles 30/9: Sí comer. Cambiar'.
 */
function comidaSemana(page: Page, fecha: string, comida: Comida): Locator {
  return page.locator(`.tarjetas-semana button.comida-tarjeta[data-fecha="${fecha}"][data-comida="${comida}"]`)
}

/**
 * Toca la comida y devuelve su burbuja: un diálogo no modal junto al botón, nombrado por su título
 * ('Almuerzo del miércoles 30/9'), con las seis opciones. Las opciones se buscan con `exact`.
 */
async function abrirComida(page: Page, fecha: string, comida: Comida): Promise<Locator> {
  const boton = comidaSemana(page, fecha, comida)
  await boton.click()
  await expect(boton).toHaveAttribute('aria-expanded', 'true')
  const dia = await boton.getAttribute('aria-label')
  const titulo = dia?.split(':')[0] ?? NOMBRE_COMIDA[comida]
  const burbuja = page.getByRole('dialog', { name: titulo, exact: true })
  await expect(burbuja).toBeVisible()
  return burbuja
}

/**
 * Un toque fuera de la burbuja, en un lugar que no hace nada: el borde izquierdo de la pantalla (la
 * burbuja nunca llega ahí: siempre deja 16px de margen).
 */
async function tocarFuera(page: Page) {
  // x=4 cae en el margen de la página (teléfono) o en el relleno del lateral (escritorio): nunca en
  // un control ni en la burbuja. Se comprueba antes de tocar, para que la prueba no mienta.
  const destino = await page.evaluate(() => {
    const elemento = document.elementFromPoint(4, 300)
    return elemento?.closest('button, a, input, select, textarea, .burbuja') ? elemento.outerHTML.slice(0, 80) : null
  })
  expect(destino, 'el punto de "tocar fuera" tiene que ser inerte').toBeNull()
  await page.mouse.click(4, 300)
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
  await page.getByLabel('Usuario').fill(USUARIOS_PRUEBA[clave].usuario)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
}

/** Borra planes y selecciones de los usuarios de prueba y deja horas límite y cierres futuros limpios. */
async function limpiar(): Promise<Record<ClaveUsuario, string>> {
  const usuarios = await asegurarUsuariosPrueba()
  const admin = clienteAdminPrueba()
  // Planes y ausencias antes que las selecciones: borrarlos congela lo vencido (triggers), y esas
  // filas tienen que irse con el resto.
  for (const tabla of ['plan_semanal', 'ausencias'] as const) {
    const { error } = await admin.from(tabla).delete().in('usuario_id', Object.values(usuarios))
    if (error) throw error
  }
  const resultados = await Promise.all([
    admin.from('selecciones_comida').delete().in('usuario_id', Object.values(usuarios)),
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
  // En la tarjeta de su día, cada comida es un botón con su valor escrito.
  const almuerzo = comidaSemana(page, miercolesSiguiente, 'almuerzo')
  await expect(almuerzo).toHaveAccessibleName(`Almuerzo del miércoles ${fechaCorta(miercolesSiguiente)}: Sí comer. Cambiar`)
  await expect(almuerzo).toContainText('Sí')
  // Tocarla abre la burbuja junto a ella, con el foco en la opción marcada.
  const burbuja = await abrirComida(page, miercolesSiguiente, 'almuerzo')
  await expect(burbuja.getByText('según tu plan', { exact: true })).toBeVisible()
  await expect(burbuja.getByRole('button', { name: 'Sí comer', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(burbuja.getByRole('button', { name: 'Sí comer', exact: true })).toBeFocused()

  await burbuja.getByRole('button', { name: 'Comer tarde', exact: true }).click()
  await burbuja.getByLabel('Hora', { exact: true }).fill('13:30')
  await burbuja.getByRole('button', { name: 'Guardar' }).click()

  await expect(burbuja.getByText('cambiada', { exact: true })).toBeVisible()
  await expect(burbuja.getByText('Hora: 13:30')).toBeVisible()
  await expect(burbuja.getByRole('button', { name: 'Comer tarde', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(almuerzo).toContainText('Tarde')
  await expect(almuerzo).toContainText('13:30')
  // Escape cierra la burbuja y el foco vuelve a la comida.
  await page.keyboard.press('Escape')
  await expect(burbuja).toHaveCount(0)
  await expect(almuerzo).toBeFocused()
  await expect(almuerzo).toHaveAttribute('aria-expanded', 'false')

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
  // Siete tarjetas, todas cerradas.
  const tarjetas = page.locator('.tarjetas-semana .tarjeta-dia')
  await expect(tarjetas).toHaveCount(7)
  await expect(tarjetas.filter({ hasText: 'Cerrado' })).toHaveCount(7)
  // Cada comida se lee (plana, con su valor), pero ninguna es un botón: no hay burbuja que abrir.
  await expect(page.locator('.week-list .comida-tarjeta')).toHaveCount(21)
  await expect(page.locator('.week-list button')).toHaveCount(0)
  await page.locator('.week-list .comida-tarjeta').first().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.status-chip')).toHaveCount(0)
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
  const burbuja = await abrirComida(page, miercolesSiguiente, 'almuerzo')
  await expect(burbuja.getByText('cambiada', { exact: true })).toBeVisible()
  await expect(burbuja.getByRole('button', { name: 'No comer', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await burbuja.getByRole('button', { name: 'Volver a mi plan' }).click()

  await expect(burbuja.getByText('según tu plan', { exact: true })).toBeVisible()
  await expect(burbuja.getByRole('button', { name: 'Sí comer', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(burbuja.getByRole('button', { name: 'Volver a mi plan' })).toHaveCount(0)
  await expect(comidaSemana(page, miercolesSiguiente, 'almuerzo')).toContainText('Sí')
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
  const almuerzo = comidaSemana(page, miercolesSiguiente, 'almuerzo')
  await expect(almuerzo).toHaveAccessibleName(`Almuerzo del miércoles ${fechaCorta(miercolesSiguiente)}: No comer. Cambiar`)
  await expect(page.getByLabel(new RegExp(`^Miércoles ${fechaCorta(miercolesSiguiente)}`)).getByText('Ausente')).toBeVisible()
  const burbuja = await abrirComida(page, miercolesSiguiente, 'almuerzo')
  await expect(burbuja.getByText('por tu ausencia', { exact: true })).toBeVisible()
  await expect(burbuja.getByRole('button', { name: 'No comer', exact: true })).toHaveAttribute('aria-pressed', 'true')

  // Puede reactivar una comida puntual: su elección gana sobre la ausencia.
  await burbuja.getByRole('button', { name: 'Sí comer', exact: true }).click()
  await expect(burbuja.getByText('cambiada', { exact: true })).toBeVisible()
  await expect(almuerzo).toContainText('Sí')

  // "Volver a mi ausencia" la devuelve a "No comer" por la ausencia (no a su plan).
  await burbuja.getByRole('button', { name: 'Volver a mi ausencia' }).click()
  await expect(burbuja.getByText('por tu ausencia', { exact: true })).toBeVisible()
  await expect(burbuja.getByRole('button', { name: 'No comer', exact: true })).toHaveAttribute('aria-pressed', 'true')

  // Al quitar la ausencia vuelve a regir su plan semanal.
  await page.goto('/calendario')
  await page.getByRole('button', { name: /^Quitar la ausencia del / }).click()
  await page.getByRole('button', { name: 'Sí, quitar' }).click()
  await expect(page.getByText('Ausencia quitada.')).toBeVisible()

  await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)
  await expect(almuerzo).toHaveAccessibleName(`Almuerzo del miércoles ${fechaCorta(miercolesSiguiente)}: Sí comer. Cambiar`)
  const deNuevo = await abrirComida(page, miercolesSiguiente, 'almuerzo')
  await expect(deNuevo.getByText('según tu plan', { exact: true })).toBeVisible()
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

test('Administración ve qué puede comer quien está enfermo, sin saber quién es', async ({ page }) => {
  const { error } = await clienteAdminPrueba()
    .from('plan_semanal')
    .insert([
      { usuario_id: ids.residente, dia_semana: 3, comida: 'almuerzo', estado: 'enfermo', nota: 'Sopa de pollo' },
      { usuario_id: ids.residente2, dia_semana: 3, comida: 'almuerzo', estado: 'enfermo', nota: 'Dieta blanda' },
    ])
  expect(error).toBeNull()

  await iniciarSesion(page, 'administracion')
  await page.goto('/comidas/plan')
  const celda = page.locator('.admin-week-table td[data-dia="3"][data-comida="almuerzo"]')
  await expect(celda.locator('.parte').first()).toHaveText('2 enfermos')
  // Una nota por persona, sin nombre (el orden es el de las personas: no se afirma).
  await expect(celda.locator('.nota-parte')).toHaveCount(2)
  await expect(celda).toContainText('Sopa de pollo')
  await expect(celda).toContainText('Dieta blanda')
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
test('el plan se edita desde la cuadrícula: el almuerzo de los martes pasa a "Comer temprano" 12:00', async ({ page }) => {
  await iniciarSesion(page, 'residente')
  await page.goto('/comidas/plan')

  // La cuadrícula es el editor: 21 celdas y ninguna lista de comidas debajo ni nada abierto.
  await expect(page.locator('.cuadro-plan .celda-plan')).toHaveCount(21)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const celda = page.getByRole('button', { name: /^Martes, almuerzo:/ })
  await expect(celda).toContainText('Falta')
  await celda.click()
  await expect(celda).toHaveAttribute('aria-expanded', 'true')

  // La misma burbuja que en la Semana, junto a la celda.
  const burbuja = page.getByRole('dialog', { name: 'Almuerzo de los martes' })
  await expect(burbuja).toContainText('¿Normalmente almorzás los martes?')
  await burbuja.getByRole('button', { name: 'Comer temprano', exact: true }).click()
  await burbuja.getByLabel('Hora', { exact: true }).fill('12:00')
  await burbuja.getByRole('button', { name: 'Guardar' }).click()

  await expect(page.locator('.toast')).toHaveText('Plan semanal actualizado')
  await expect(celda).toHaveAccessibleName('Martes, almuerzo: Comer temprano 12:00. Cambiar')
  await expect(celda).toContainText('Temprano')
  await expect(celda).toContainText('12:00')
  await expect
    .poll(async () => {
      const { data } = await clienteAdminPrueba()
        .from('plan_semanal')
        .select('dia_semana, comida, estado, nota')
        .eq('usuario_id', ids.residente)
      return data
    })
    .toEqual([{ dia_semana: 2, comida: 'almuerzo', estado: 'temprano', nota: '12:00' }])

  // Como en la Semana: pasar a "Comer tarde" trae la misma hora, pero nada cambia hasta "Guardar".
  await burbuja.getByRole('button', { name: 'Comer tarde', exact: true }).click()
  await expect(burbuja.getByLabel('Hora', { exact: true })).toHaveValue('12:00')
  await expect(celda).toContainText('Temprano')
  await burbuja.getByRole('button', { name: 'Cancelar' }).click()
  await expect(burbuja.getByLabel('Hora', { exact: true })).toHaveCount(0)
  await expect(celda).toHaveAccessibleName('Martes, almuerzo: Comer temprano 12:00. Cambiar')

  // Una burbuja a la vez: tocar otra celda cierra esta y abre aquella.
  const cena = page.getByRole('button', { name: /^Martes, cena:/ })
  await cena.click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.getByRole('dialog', { name: 'Cena de los martes' })).toBeVisible()
  await expect(page.locator('.celda-plan[aria-expanded="true"]')).toHaveCount(1)
  await expect(celda).toHaveAttribute('aria-expanded', 'false')

  // "Listo" cierra la burbuja y devuelve el foco a la celda.
  await page.getByRole('dialog').getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(cena).toBeFocused()

  // Al volver a la página, el plan guardado sigue ahí.
  await page.reload()
  await expect(page.getByRole('button', { name: /^Martes, almuerzo:/ })).toContainText('12:00')
})

test('una hora escrita se guarda con "Listo" o con un toque fuera (sin "Guardar"); sin hora, no se cierra y dice por qué', async ({
  page,
}) => {
  const { lunesSiguiente, miercolesSiguiente } = fechas()
  await planAlmuerzoMiercoles()
  const admin = clienteAdminPrueba()
  await iniciarSesion(page, 'residente')

  // Plan semanal: sin hora, "Listo" no cierra; con la hora, "Listo" la guarda.
  await page.goto('/comidas/plan')
  const celda = page.getByRole('button', { name: /^Jueves, cena:/ })
  await celda.click()
  const burbujaPlan = page.getByRole('dialog', { name: 'Cena de los jueves' })
  await burbujaPlan.getByRole('button', { name: 'Comer temprano', exact: true }).click()
  await burbujaPlan.getByRole('button', { name: 'Listo' }).click()
  await expect(burbujaPlan).toBeVisible()
  await expect(burbujaPlan.locator('.campo-error')).toContainText('Indicá la hora para "Comer temprano"')
  await expect(burbujaPlan.getByLabel('Hora', { exact: true })).toBeFocused()
  await burbujaPlan.getByLabel('Hora', { exact: true }).fill('18:30')
  await burbujaPlan.getByRole('button', { name: 'Listo' }).click()
  await expect(burbujaPlan).toHaveCount(0)
  await expect(celda).toHaveAccessibleName('Jueves, cena: Comer temprano 18:30. Cambiar')
  await expect(celda).toBeFocused()
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('plan_semanal')
        .select('estado, nota')
        .eq('usuario_id', ids.residente)
        .eq('dia_semana', 4)
        .eq('comida', 'cena')
      return data
    })
    .toEqual([{ estado: 'temprano', nota: '18:30' }])

  // Semana: sin hora, ni "Listo" ni un toque fuera cierran; con la hora, un toque fuera la guarda.
  await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)
  const almuerzo = comidaSemana(page, miercolesSiguiente, 'almuerzo')
  const burbuja = await abrirComida(page, miercolesSiguiente, 'almuerzo')
  await burbuja.getByRole('button', { name: 'Comer tarde', exact: true }).click()
  await burbuja.getByRole('button', { name: 'Listo' }).click()
  await expect(burbuja).toBeVisible()
  await expect(burbuja.locator('.campo-error')).toContainText('Si no querés cambiarla, tocá "Cancelar".')
  await expect(burbuja.getByLabel('Hora', { exact: true })).toBeFocused()
  await tocarFuera(page)
  await expect(burbuja).toBeVisible()
  await expect(burbuja.locator('.campo-error')).toBeVisible()

  await burbuja.getByLabel('Hora', { exact: true }).fill('13:15')
  await tocarFuera(page)
  await expect(burbuja).toHaveCount(0)
  await expect(almuerzo).toContainText('13:15')
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
    .toEqual([{ estado: 'tarde', nota: '13:15', origen: 'persona' }])
  const deNuevo = await abrirComida(page, miercolesSiguiente, 'almuerzo')
  await expect(deNuevo.getByText('cambiada', { exact: true })).toBeVisible()
  await expect(deNuevo.getByText('Hora: 13:15')).toBeVisible()
})

test('Escape descarta la hora a medio escribir y devuelve el foco; tocar otra comida cierra esta y abre aquella', async ({
  page,
}) => {
  const { lunesSiguiente, miercolesSiguiente } = fechas()
  await planAlmuerzoMiercoles()
  await iniciarSesion(page, 'residente')
  await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)

  const almuerzo = comidaSemana(page, miercolesSiguiente, 'almuerzo')
  const burbuja = await abrirComida(page, miercolesSiguiente, 'almuerzo')
  await burbuja.getByRole('button', { name: 'Comer temprano', exact: true }).click()
  await burbuja.getByLabel('Hora', { exact: true }).fill('11:45')
  await page.keyboard.press('Escape')
  await expect(burbuja).toHaveCount(0)
  await expect(almuerzo).toBeFocused()
  await expect(almuerzo).toHaveAccessibleName(`Almuerzo del miércoles ${fechaCorta(miercolesSiguiente)}: Sí comer. Cambiar`)

  // Una burbuja a la vez: tocar otra comida (el almuerzo del lunes, que la burbuja no tapa y que en la
  // semana siguiente nunca está cerrado) cierra esta y abre aquella.
  await abrirComida(page, miercolesSiguiente, 'almuerzo')
  const otra = await abrirComida(page, lunesSiguiente, 'almuerzo')
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(otra).toBeVisible()
  await expect(almuerzo).toHaveAttribute('aria-expanded', 'false')

  // Nada se guardó.
  const { data } = await clienteAdminPrueba()
    .from('selecciones_comida')
    .select('estado')
    .eq('usuario_id', ids.residente)
    .eq('fecha', miercolesSiguiente)
  expect(data).toEqual([])
})

for (const viewport of [
  { width: 320, height: 640 },
  { width: 375, height: 812 },
]) {
  test.describe(`en un teléfono de ${viewport.width}px`, () => {
    test.use({ viewport })

    test('Plan y Semana caben sin scroll lateral, la burbuja entra en la pantalla y todo lo que se toca mide al menos 56px', async ({
      page,
    }) => {
      const { lunesSiguiente, miercolesSiguiente } = fechas()
      await planAlmuerzoMiercoles()
      await iniciarSesion(page, 'residente')

      await page.goto('/comidas/plan')
      await page.getByRole('button', { name: /^Miércoles, almuerzo:/ }).click()
      const burbujaPlan = page.getByRole('dialog', { name: 'Almuerzo de los miércoles' })
      await esperarDentroDeLaPantalla(page, burbujaPlan)
      await esperarFocoALaVista(burbujaPlan)
      await esperarSinScrollLateral(page)
      await esperarAltoMinimo(page.locator('.cuadro-plan button'))
      await esperarAltoMinimo(burbujaPlan.getByRole('button'))
      // La del domingo, al final: arriba de la celda si abajo no entra, y siempre dentro; lo que tiene el
      // foco, a la vista (ni bajo la barra inferior ni bajo la cabecera fija de las comidas).
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: /^Domingo, cena:/ }).click()
      const burbujaDomingo = page.getByRole('dialog', { name: 'Cena de los domingos' })
      await esperarDentroDeLaPantalla(page, burbujaDomingo)
      await esperarFocoALaVista(burbujaDomingo)
      await esperarSinScrollLateral(page)

      await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)
      await esperarAltoMinimo(page.locator('.tarjetas-semana button'))
      const burbuja = await abrirComida(page, miercolesSiguiente, 'almuerzo')
      await esperarFocoALaVista(burbuja)
      await burbuja.getByRole('button', { name: 'Comer temprano', exact: true }).click()
      await esperarDentroDeLaPantalla(page, burbuja)
      // El campo de la hora toma el foco: tiene que verse, no quedar bajo la barra inferior.
      await esperarFocoALaVista(burbuja)
      await esperarSinScrollLateral(page)
      await esperarAltoMinimo(burbuja.getByRole('button'))

      // Con la letra más grande, tampoco se sale.
      await page.keyboard.press('Escape')
      await page.evaluate(() => document.documentElement.setAttribute('data-texto', 'enorme'))
      const grande = await abrirComida(page, miercolesSiguiente, 'almuerzo')
      await esperarFocoALaVista(grande)
      await grande.getByRole('button', { name: 'Comer temprano', exact: true }).click()
      await esperarDentroDeLaPantalla(page, grande)
      await esperarFocoALaVista(grande)
      await esperarSinScrollLateral(page)
      await esperarAltoMinimo(grande.getByRole('button'))
    })
  })
}
