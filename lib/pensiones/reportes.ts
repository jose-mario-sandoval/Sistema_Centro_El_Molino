import type { Rol } from '@/lib/perfiles/roles'

export const CATEGORIAS_REPORTE = ['finanzas', 'otras_utilidades'] as const
export type CategoriaReporte = (typeof CATEGORIAS_REPORTE)[number]
export const ETIQUETA_REPORTE: Record<CategoriaReporte, string> = {
  finanzas: 'Resúmenes Económicos',
  otras_utilidades: 'Otros documentos',
}
export const MAX_REPORTES_POR_CATEGORIA = 12
export const MAX_BYTES_REPORTE = 3 * 1024 * 1024
export const BUCKET_REPORTES = 'pensiones-reportes'

/**
 * Los formatos que se pueden subir. La extensión del nombre decide el formato; el servidor comprueba además
 * que el contenido corresponda (`lib/validacion/reportes-pensiones.ts`). Sin macros: .xlsm/.xlsb no entran.
 * Los tipos MIME son los mismos que permite el bucket (migración 20261123110000).
 */
export const FORMATOS_REPORTE = {
  pdf: { etiqueta: 'PDF', mime: 'application/pdf' },
  xlsx: { etiqueta: 'Excel', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  xls: { etiqueta: 'Excel', mime: 'application/vnd.ms-excel' },
  csv: { etiqueta: 'CSV', mime: 'text/csv' },
} as const
export type FormatoReporte = keyof typeof FORMATOS_REPORTE

/** Valor de `accept` del selector de archivos: extensiones y tipos MIME. */
export const ACEPTAR_REPORTES = [
  ...Object.keys(FORMATOS_REPORTE).map((extension) => `.${extension}`),
  ...Object.values(FORMATOS_REPORTE).map((formato) => formato.mime),
].join(',')

/** El formato según la extensión final de un nombre o ruta ('Balance.XLSX' → 'xlsx'); null si no es uno admitido. */
export function formatoReporte(nombre: string): FormatoReporte | null {
  const extension = /\.([a-z0-9]+)$/i.exec(nombre)?.[1].toLowerCase()
  // hasOwnProperty y no `in`: 'toString' o 'constructor' no son formatos. Sin Object.hasOwn, que iOS 15.0-15.3 no tiene.
  return extension !== undefined && Object.prototype.hasOwnProperty.call(FORMATOS_REPORTE, extension) ? (extension as FormatoReporte) : null
}

/** 'PDF' · 'Excel' · 'CSV' para mostrar junto al archivo; vacío si no es un formato conocido. */
export function etiquetaFormatoReporte(nombre: string): string {
  const formato = formatoReporte(nombre)
  return formato ? FORMATOS_REPORTE[formato].etiqueta : ''
}

/** Content-Type de una descarga: el del formato; un nombre desconocido nunca se sirve como algo ejecutable. */
export function tipoContenidoReporte(nombre: string): string {
  const formato = formatoReporte(nombre)
  return formato ? FORMATOS_REPORTE[formato].mime : 'application/octet-stream'
}

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
  const limpio = nombreReporteSeguro(nombre) || 'reporte'
  const ascii = limpio.replace(/[^a-zA-Z0-9._ -]/g, '_')
  const codificado = encodeURIComponent(limpio).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${codificado}`
}
