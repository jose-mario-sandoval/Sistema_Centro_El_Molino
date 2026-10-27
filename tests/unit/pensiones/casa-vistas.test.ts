import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import PaginaPensionesCasa from '@/app/(app)/pensiones/casa/page'
import { MarcarPensiones } from '@/app/(app)/pensiones/_componentes/marcar'
import { exigirRol } from '@/lib/auth/sesion'
import { obtenerHistorialDe, obtenerPensionesDe, obtenerPersonasPensionesCasa } from '@/lib/pensiones/consultas'
import { perfilDePrueba } from '@/tests/soporte/supabase-falso'
import type { MesPension, PagoPension } from '@/lib/pensiones/tipos'

vi.mock('@/lib/auth/sesion', () => ({ exigirRol: vi.fn() }))
vi.mock('@/lib/pensiones/consultas', () => ({ obtenerHistorialDe: vi.fn(), obtenerPensionesDe: vi.fn(), obtenerPersonasPensionesCasa: vi.fn() }))
vi.mock('@/app/(app)/pensiones/acciones', () => ({ marcarPensiones: vi.fn(), marcarPensionesDe: vi.fn() }))
vi.mock('@/components/ui/avisos', () => ({ useAviso: () => vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const director = perfilDePrueba('director', 'director')
const residente = { ...perfilDePrueba('residente', 'residente'), nombre: 'Residente elegida' }
const otroDirector = { ...perfilDePrueba('director2', 'director'), nombre: 'Otro Director' }
const mes: MesPension = { periodo: '2027-01-01', categoria: 'profesional', monto_centavos: 30000, pagado_centavos: 10000, registrado_en: null, exento: false }
const pago: PagoPension = { id: 'pago', usuario_id: residente.id, registrado_por: director.id, periodo: mes.periodo, categoria: 'profesional', monto_centavos: 30000, abono_centavos: 10000, registrado_en: '2027-01-01T18:00:00Z' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(exigirRol).mockResolvedValue(director)
  vi.mocked(obtenerPersonasPensionesCasa).mockResolvedValue([director, residente, otroDirector])
  vi.mocked(obtenerPensionesDe).mockResolvedValue([mes])
  vi.mocked(obtenerHistorialDe).mockResolvedValue([pago])
})

it('exige Director antes de consultar el listado o pagos', async () => {
  vi.mocked(exigirRol).mockRejectedValue(new Error('Sin permiso'))
  await expect(PaginaPensionesCasa({ searchParams: Promise.resolve({ persona: residente.id }) })).rejects.toThrow('Sin permiso')
  expect(exigirRol).toHaveBeenCalledWith('director')
  expect(obtenerPersonasPensionesCasa).not.toHaveBeenCalled()
  expect(obtenerPensionesDe).not.toHaveBeenCalled()
})

it.each(['inexistente', director.id])('rechaza consultar un objetivo ajeno al listado de otras personas activas: %s', async (persona) => {
  const html = renderToStaticMarkup(await PaginaPensionesCasa({ searchParams: Promise.resolve({ persona, anio: '2027' }) }))
  expect(html).toContain('Elegí una cuenta activa')
  expect(html).not.toContain(`value="${director.id}"`)
  expect(html).toContain(residente.nombre)
  expect(html).toContain(otroDirector.nombre)
  expect(obtenerPensionesDe).not.toHaveBeenCalled()
  expect(obtenerHistorialDe).not.toHaveBeenCalled()
})

it('consulta el objetivo seleccionado y conserva persona y año en el formulario', async () => {
  const html = renderToStaticMarkup(await PaginaPensionesCasa({ searchParams: Promise.resolve({ persona: residente.id, anio: '2027' }) }))
  expect(obtenerPensionesDe).toHaveBeenCalledWith(residente.id, 2027)
  expect(obtenerHistorialDe).toHaveBeenCalledWith(residente.id)
  expect(html).toContain('Pensión de Residente elegida')
  expect(html).toContain('name="persona"')
  expect(html).toContain('value="residente" selected=""')
  expect(html).toContain('value="2027"')
  expect(html).toContain('Cuota: $300.00')
  expect(html).toContain('Pagado: $100.00 · Saldo pendiente: $200.00')
  expect(html).toContain('Pago parcial')
  expect(html).toContain('Pagó $100.00 (cuota de $300.00)')
  expect(html).toContain('Registrado por el Director')
  expect(html).not.toContain('Pagaste')
})

it('el historial propio identifica los pagos registrados por un Director y conserva los propios sin esa indicación', () => {
  const html = renderToStaticMarkup(createElement(MarcarPensiones, {
    meses: [], historial: [pago, { ...pago, id: 'propio', registrado_por: residente.id }],
  }))
  expect(html.match(/Registrado por el Director/g)).toHaveLength(1)
  expect(html).toContain('Tu historial de pagos')
  expect(html).toContain('Pagaste $100.00')
})

it('la persona exenta no tiene meses seleccionables ni permite revisar pagos ficticios', () => {
  const html = renderToStaticMarkup(createElement(MarcarPensiones, {
    meses: [{ ...mes, exento: true, monto_centavos: 0, pagado_centavos: 0 }], historial: [], persona: { id: residente.id, nombre: residente.nombre },
  }))
  expect(html).toContain('Exento de pensión')
  expect(html).toContain('No requiere registrar pagos.')
  expect(html).toMatch(/type="checkbox"[^>]*disabled=""/)
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Revisar pagos<\/button>/)
})
