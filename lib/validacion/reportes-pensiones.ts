import { z } from 'zod'
import { categoriaReporteValida, formatoReporte, MAX_BYTES_REPORTE, nombreReporteSeguro, type FormatoReporte } from '@/lib/pensiones/reportes'
import { exito, fallo } from '@/lib/acciones/resultado'

/** Firma y terminador del PDF; no alcanza con renombrar una imagen o enviar un MIME PDF. */
export function tieneFirmaPDF(bytes: Uint8Array): boolean {
  if (bytes.length < 14) return false
  const decodificador = new TextDecoder('ascii')
  const encabezado = decodificador.decode(bytes.subarray(0, 8))
  const final = decodificador.decode(bytes.subarray(Math.max(0, bytes.length - 1024)))
  return /^%PDF-(?:1\.[0-7]|2\.0)/.test(encabezado) && /%%EOF[\t\n\r ]*$/.test(final)
}

/** Un byte por carácter: sirve para buscar nombres internos de un archivo binario sin interpretar su contenido. */
function comoLatin1(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes)
}

/** Texto en UTF-16LE tal como se guarda en un archivo OLE (cada carácter seguido de un byte nulo). */
function utf16(texto: string): string {
  return [...texto].join('\0') + '\0'
}

/** Registro de fin del directorio central de un ZIP, que un archivo cortado a medias no tiene. */
const FIN_DE_ZIP = 'PK\u0005\u0006'
/** Hasta 22 bytes del registro más un comentario de 65 535 como máximo. */
const COLA_DEL_ZIP = 22 + 65_535

/**
 * Un libro de Excel moderno (.xlsx) es un ZIP con `[Content_Types].xml` y `xl/workbook.xml`. Los nombres de
 * las partes van sin comprimir, así que se buscan directamente. Un .docx o un .zip cualquiera no los tienen.
 */
export function tieneFirmaXLSX(bytes: Uint8Array): boolean {
  if (bytes.length < 100 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) return false
  const texto = comoLatin1(bytes)
  return texto.slice(-COLA_DEL_ZIP).includes(FIN_DE_ZIP) && texto.includes('[Content_Types].xml') && texto.includes('xl/workbook.xml')
}

/** Cabecera de un contenedor OLE2 (el formato de Office 97-2003). */
const CABECERA_OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

/**
 * Un libro de Excel antiguo (.xls) es un contenedor OLE2 con un flujo "Workbook" (Excel 97 en adelante) o
 * "Book" (Excel 5/95). Un .doc o un .ppt también son OLE2, pero no tienen ese flujo.
 */
export function tieneFirmaXLS(bytes: Uint8Array): boolean {
  if (bytes.length < 512 || CABECERA_OLE.some((valor, indice) => bytes[indice] !== valor)) return false
  const texto = comoLatin1(bytes)
  return texto.includes(utf16('Workbook')) || texto.includes(utf16('Book'))
}

/** Un libro con macros (aunque lleve extensión .xlsx o .xls): trae un proyecto de VBA. */
export function tieneMacrosExcel(bytes: Uint8Array): boolean {
  const texto = comoLatin1(bytes)
  return texto.includes('vbaProject.bin') || texto.includes(utf16('_VBA_PROJECT'))
}

/**
 * Un CSV es texto plano: sin bytes nulos ni caracteres de control (salvo tabulador, salto de línea, retorno de
 * carro y salto de página). Sirve igual en UTF-8 que en Windows-1252; un archivo binario con extensión .csv no pasa.
 */
export function pareceCSV(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false
  for (const byte of bytes) {
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0c && byte !== 0x0d) return false
  }
  return true
}

const NO_VALIDO: Record<FormatoReporte, string> = {
  pdf: 'El archivo no es un PDF válido. Revisá el documento e intentá de nuevo.',
  xlsx: 'El archivo no es un Excel (.xlsx) válido. Abrilo en Excel, guardalo de nuevo e intentá otra vez.',
  xls: 'El archivo no es un Excel (.xls) válido. Abrilo en Excel, guardalo de nuevo e intentá otra vez.',
  csv: 'El archivo no parece un CSV de texto. Guardalo desde Excel como "CSV (delimitado por comas)" e intentá otra vez.',
}

const CON_MACROS = 'No se aceptan archivos de Excel con macros. Guardalo como libro de Excel normal (.xlsx) e intentá otra vez.'

const COMPROBAR: Record<FormatoReporte, (bytes: Uint8Array) => boolean> = {
  pdf: tieneFirmaPDF,
  xlsx: tieneFirmaXLSX,
  xls: tieneFirmaXLS,
  csv: pareceCSV,
}

export async function validarCargaReporte(formulario: FormData) {
  const categoria = formulario.get('categoria')
  if (!categoriaReporteValida(categoria)) return fallo('Elegí una categoría de reporte válida.')
  const archivo = formulario.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) return fallo('Elegí el archivo que querés subir (PDF o Excel).')
  if (archivo.size > MAX_BYTES_REPORTE) return fallo('El archivo debe pesar como máximo 3 MiB.')
  const nombre = nombreReporteSeguro(archivo.name)
  const formato = formatoReporte(nombre)
  if (!nombre || !formato) return fallo('El archivo debe ser PDF o Excel (.pdf, .xlsx, .xls o .csv). Si es Excel con macros (.xlsm), guardalo como .xlsx.')
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  if (!COMPROBAR[formato](bytes)) return fallo(NO_VALIDO[formato])
  if ((formato === 'xlsx' || formato === 'xls') && tieneMacrosExcel(bytes)) return fallo(CON_MACROS)
  return exito({ categoria, nombre, formato, bytes, tamano: bytes.byteLength })
}

export const esquemaEliminarReporte = z.object({ id: z.uuid() })
