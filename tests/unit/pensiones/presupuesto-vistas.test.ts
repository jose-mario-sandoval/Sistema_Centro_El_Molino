import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import PaginaPresupuesto from '@/app/(app)/pensiones/presupuesto/page'
import { PresupuestoAnual } from '@/app/(app)/pensiones/_componentes/presupuesto-anual'
import { exigirRol } from '@/lib/auth/sesion'
import { obtenerPresupuesto } from '@/lib/pensiones/consultas'
import { resumenAnual } from '@/lib/pensiones/calculos'
import { ETIQUETA_DONACIONES } from '@/lib/pensiones/etiquetas'
import { perfilDePrueba } from '@/tests/soporte/supabase-falso'
import type { FilaPresupuesto } from '@/lib/pensiones/tipos'

vi.mock('@/lib/auth/sesion', () => ({ exigirRol: vi.fn() }))
vi.mock('@/lib/pensiones/consultas', () => ({ obtenerPresupuesto: vi.fn(), obtenerPresupuestoAnual: vi.fn() }))

const donacion: FilaPresupuesto = {
  concepto: 'donacion', usuario_id: null, etiqueta: ETIQUETA_DONACIONES,
  periodo: '2027-01-01', categoria: null, monto_centavos: 20000,
  pagado_centavos: 0, registrado_en: null, exento: false,
}
const pension: FilaPresupuesto = {
  ...donacion, concepto: 'pension', usuario_id: 'persona', etiqueta: 'AB',
  monto_centavos: 100000, pagado_centavos: 60000,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(exigirRol).mockResolvedValue(perfilDePrueba('administradora', 'administradora'))
})

it.each([0, 20000])('muestra la fila compartida y los totales mensuales sin contar la donación como persona: %s', async (recibido) => {
  vi.mocked(obtenerPresupuesto).mockResolvedValue([pension, { ...donacion, pagado_centavos: recibido }])
  const html = renderToStaticMarkup(await PaginaPresupuesto({ searchParams: Promise.resolve({ anio: '2027', mes: '1' }) }))
  expect(html).toContain('Presupuesto ejecutado')
  expect(html).toContain('Presupuesto mensual')
  expect(html).toContain('Pendiente de recibir')
  expect(html).toContain('1 persona con pago pendiente')
  expect(html).not.toContain('2 personas con pagos pendientes')
  const fila = html.match(/<li aria-label="Ingresos por donaciones">([\s\S]*?)<\/li>/)?.[1]
  expect(fila).toContain('Esperado: $200.00')
  expect(fila).toContain(`Recibido: $${recibido === 0 ? '0.00' : '200.00'}`)
  expect(fila).toContain(recibido === 0 ? 'Pendiente de recibir' : 'Recibido')
  expect(html).toContain(recibido === 0 ? 'value="50"' : 'value="66.66666666666666"')
  expect(html).toContain('Las personas se identifican únicamente por sus siglas.')
})

it('la vista anual separa el concepto de las personas y conserva las etiquetas de presupuesto', () => {
  const html = renderToStaticMarkup(createElement(PresupuestoAnual, {
    anio: 2027, resumen: resumenAnual([[pension, donacion]]), mesDeHoy: '2027-01-01', rol: 'administradora',
  }))
  expect(html).toContain('Presupuesto anual')
  expect(html).toContain('Presupuesto ejecutado')
  expect(html).not.toMatch(/Meta mensual|Meta del año|Falta para la meta|Registrado como pagado/)
  const personas = html.match(/<section class="card" aria-label="Por persona">([\s\S]*?)<\/section>/)?.[1]
  expect(personas).toContain('AB')
  expect(personas).not.toContain(ETIQUETA_DONACIONES)
  expect(html).toContain('aria-label="Ingresos por donaciones"')
})

it('la ausencia de configuración se informa sin inventar una persona sin cuota', async () => {
  vi.mocked(obtenerPresupuesto).mockResolvedValue([{ ...donacion, monto_centavos: null }])
  const html = renderToStaticMarkup(await PaginaPresupuesto({ searchParams: Promise.resolve({ anio: '2027', mes: '1' }) }))
  expect(html).toContain('Ingresos por donaciones: sin monto configurado')
  expect(html).not.toContain('persona sin monto asignado')
})
