import { ESTADOS_COMIDA, INFO_ESTADO, type EstadoComida, type SeleccionGuardada, type ValorEfectivo } from './tipos'

export type ClaveResumen = EstadoComida | 'sin_definir'
export type ParteResumen = { clave: ClaveResumen; cantidad: number; texto: string }
export type ResumenComida = { total: number; partes: ParteResumen[] }

const ETIQUETA_CORTA: Record<EstadoComida, string> = {
  si: 'sí',
  no: 'no',
  temprano: 'temprano',
  tarde: 'tarde',
  bolsa: 'en bolsa',
  enfermo: 'enfermo',
}

/** ['13:30', '14:00', '13:30'] → ['13:30 ×2', '14:00'] */
function horasAgrupadas(notas: (string | null)[]): string[] {
  const conteo = new Map<string, number>()
  for (const nota of notas) {
    if (nota) conteo.set(nota, (conteo.get(nota) ?? 0) + 1)
  }
  return [...conteo.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([hora, cantidad]) => (cantidad > 1 ? `${hora} ×${cantidad}` : hora))
}

/** Conteo de una comida para el resumen de Administración (spec §6.5). null = "Sin definir". */
export function resumenComida(valores: ValorEfectivo[]): ResumenComida {
  const partes: ParteResumen[] = []

  for (const estado of ESTADOS_COMIDA) {
    const delEstado = valores.filter((valor): valor is SeleccionGuardada => valor !== null && valor.estado === estado)
    if (delEstado.length === 0) continue
    let texto = `${delEstado.length} ${ETIQUETA_CORTA[estado]}`
    if (INFO_ESTADO[estado].nota === 'hora') {
      const horas = horasAgrupadas(delEstado.map((valor) => valor.nota))
      if (horas.length > 0) texto += ` (${horas.join(', ')})`
    }
    partes.push({ clave: estado, cantidad: delEstado.length, texto })
  }

  const sinDefinir = valores.filter((valor) => valor === null).length
  if (sinDefinir > 0) partes.push({ clave: 'sin_definir', cantidad: sinDefinir, texto: `${sinDefinir} sin definir` })

  return { total: valores.length, partes }
}

export function textoResumen(resumen: ResumenComida): string {
  if (resumen.partes.length === 0) return 'Sin personas'
  return resumen.partes.map((parte) => parte.texto).join(' · ')
}
