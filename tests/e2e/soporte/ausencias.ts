import { expect, type Locator, type Page } from '@playwright/test'
import type { FechaISO } from '../../../lib/fechas'

/** La barra "Ausencias" de /calendario (una `<section>` nombrada por su título). */
export function panelAusencias(page: Page): Locator {
  return page.getByRole('region', { name: 'Ausencias', exact: true })
}

/** Abre el contenido del calendario; la tarjeta reutilizada en La casa ya está abierta. */
export async function abrirPanelAusencias(panel: Locator) {
  const barra = panel.getByRole('button', { name: 'Ausencias', exact: true })
  if (await barra.count() && await barra.getAttribute('aria-expanded') === 'false') await barra.click()
}

/** Lleva el mini calendario (ya abierto) al mes de `fecha` con sus botones de mes. */
export async function irAlMesDe(miniCalendario: Locator, fecha: FechaISO) {
  const mes = fecha.slice(0, 7)
  // Los límites son de hoy a un año: nunca hacen falta más de 13 pasos.
  for (let pasos = 0; pasos <= 13; pasos++) {
    const actual = await miniCalendario.getAttribute('data-mes')
    if (actual === null) throw new Error('El mini calendario no dice qué mes muestra (data-mes).')
    if (actual === mes) return
    await miniCalendario.getByRole('button', { name: actual < mes ? 'Ir al mes siguiente' : 'Ir al mes anterior' }).click()
    await expect(miniCalendario).not.toHaveAttribute('data-mes', actual)
  }
  throw new Error(`El mini calendario no llegó a ${mes}.`)
}

/**
 * Marca una ausencia desde /calendario como lo haría la persona: abre "Marcar una ausencia", toca el
 * primer y el último día en el mini calendario (cambiando de mes si hace falta) y guarda. Para un
 * solo día basta con no pasar `hasta`: un toque y "Guardar ausencia".
 *
 * No espera el aviso: cada prueba decide qué comprobar después ("Ausencia marcada.", un error…).
 * `panel`: otro panel de ausencias (el de una persona en La casa del Director).
 */
export async function marcarAusencia(
  page: Page,
  desde: FechaISO,
  hasta: FechaISO = desde,
  panel: Locator = panelAusencias(page),
) {
  await abrirPanelAusencias(panel)
  await panel.getByRole('button', { name: 'Marcar una ausencia' }).click()
  const miniCalendario = panel.locator('.mini-calendario')
  await irAlMesDe(miniCalendario, desde)
  await miniCalendario.locator(`.mini-dia[data-fecha="${desde}"]`).click()
  if (hasta !== desde) {
    await irAlMesDe(miniCalendario, hasta)
    await miniCalendario.locator(`.mini-dia[data-fecha="${hasta}"]`).click()
  }
  await panel.getByRole('button', { name: 'Guardar ausencia' }).click()
}
