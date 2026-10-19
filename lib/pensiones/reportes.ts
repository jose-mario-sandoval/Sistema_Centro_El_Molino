import type { Rol } from '@/lib/perfiles/roles'

export const CATEGORIAS_REPORTE = ['finanzas', 'otras_utilidades'] as const
export type CategoriaReporte = (typeof CATEGORIAS_REPORTE)[number]
export const ETIQUETA_REPORTE: Record<CategoriaReporte, string> = {
  finanzas: 'Reporte finanzas',
  otras_utilidades: 'Reporte de otras utilidades',
}
export const MAX_REPORTES_POR_CATEGORIA = 12
export const MAX_BYTES_REPORTE = 3 * 1024 * 1024
export const BUCKET_REPORTES = 'pensiones-reportes'

/** El navegador recibe sólo la ficha del documento, nunca su ruta privada de Storage. */
export type ReportePension = {
  id: string
  categoria: CategoriaReporte
  nombre: string
  tamano: number
  cargadoEn: string
}

export function puedeConsultarReportes(rol: Rol): boolean {
  return rol === 'director' || rol === 'administradora'
}

export function puedeSubirReportes(rol: Rol): boolean {
  return rol === 'administradora'
}

export function categoriaReporteValida(valor: unknown): valor is CategoriaReporte {
  return CATEGORIAS_REPORTE.some((categoria) => categoria === valor)
}

/** Quita separadores y caracteres de control; el nombre nunca se usa como ruta de Storage. */
export function nombreReporteSeguro(nombre: string): string {
  return nombre.replace(/[\u0000-\u001f\u007f/\\]/g, '_').trim().slice(0, 180)
}

/** Defensa adicional al descargar: cabecera attachment, nombre ASCII y RFC 5987 para tildes. */
export function disposicionDescarga(nombre: string): string {
  const limpio = nombreReporteSeguro(nombre) || 'reporte.pdf'
  const ascii = limpio.replace(/[^a-zA-Z0-9._ -]/g, '_')
  const codificado = encodeURIComponent(limpio).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${codificado}`
}
