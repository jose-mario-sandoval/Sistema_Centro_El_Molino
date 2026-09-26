import { expect, type Locator, type Page } from '@playwright/test'

/** Sin scroll lateral a ningún ancho (DESIGN.md §4 y §11, WCAG 1.4.10). */
export async function esperarSinScrollLateral(page: Page) {
  const { pagina, pantalla } = await page.evaluate(() => ({
    pagina: document.documentElement.scrollWidth,
    pantalla: window.innerWidth,
  }))
  expect(pagina, 'la página no debe tener scroll lateral').toBeLessThanOrEqual(pantalla)
}

/** Ningún objetivo táctil visible por debajo de `minimo` px de alto (DESIGN.md §4: 56). */
export async function esperarAltoMinimo(botones: Locator, minimo = 56) {
  const medidas = await botones.evaluateAll((elementos) =>
    elementos
      .filter((e) => e.getClientRects().length > 0)
      .map((e) => ({
        nombre: (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 40),
        alto: Math.round(e.getBoundingClientRect().height * 10) / 10,
      })),
  )
  expect(medidas.length, 'no se encontró ningún botón para medir').toBeGreaterThan(0)
  expect(
    medidas.filter((m) => m.alto < minimo - 0.5),
    `botones de menos de ${minimo}px de alto`,
  ).toEqual([])
}
