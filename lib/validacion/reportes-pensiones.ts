import { categoriaReporteValida, MAX_BYTES_REPORTE, nombreReporteSeguro } from '@/lib/pensiones/reportes'
import { exito, fallo } from '@/lib/acciones/resultado'

/** Firma y terminador del PDF; no alcanza con renombrar una imagen o enviar un MIME PDF. */
export function tieneFirmaPDF(bytes: Uint8Array): boolean {
  if (bytes.length < 14) return false
  const decodificador = new TextDecoder('ascii')
  const encabezado = decodificador.decode(bytes.subarray(0, 8))
  const final = decodificador.decode(bytes.subarray(Math.max(0, bytes.length - 1024)))
  return /^%PDF-(?:1\.[0-7]|2\.0)/.test(encabezado) && /%%EOF[\t\n\r ]*$/.test(final)
}

export async function validarCargaReporte(formulario: FormData) {
  const categoria = formulario.get('categoria')
  if (!categoriaReporteValida(categoria)) return fallo('Elegí una categoría de reporte válida.')
  const archivo = formulario.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) return fallo('Elegí el PDF que querés subir.')
  if (archivo.size > MAX_BYTES_REPORTE) return fallo('El PDF debe pesar como máximo 3 MiB.')
  const nombre = nombreReporteSeguro(archivo.name)
  if (!nombre || !/\.pdf$/i.test(nombre)) return fallo('El archivo debe tener extensión .pdf.')
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  if (!tieneFirmaPDF(bytes)) return fallo('El archivo no es un PDF válido. Revisá el documento e intentá de nuevo.')
  return exito({ categoria, nombre, bytes, tamano: bytes.byteLength })
}
