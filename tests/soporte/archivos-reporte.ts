/**
 * Archivos mínimos para probar la validación de reportes (PDF aparte): no son libros reales, tienen solo la estructura
 * que mira `lib/validacion/reportes-pensiones.ts` (nombres de las partes de un ZIP, flujos de un contenedor OLE2).
 */
type Bytes = Uint8Array<ArrayBuffer>
export const codificar = (texto: string): Bytes => new TextEncoder().encode(texto)
export const juntar = (...partes: Uint8Array[]): Bytes => {
  const todo = new Uint8Array(partes.reduce((suma, parte) => suma + parte.length, 0))
  let desde = 0
  for (const parte of partes) { todo.set(parte, desde); desde += parte.length }
  return todo
}
/** Un ZIP mínimo: encabezados locales con los nombres de sus partes y el registro final. Lo que miramos es su estructura. */
export function zipConPartes(partes: string[], { cerrado = true } = {}): Bytes {
  const locales = partes.map((nombre) => juntar(Uint8Array.of(0x50, 0x4b, 0x03, 0x04), new Uint8Array(26), codificar(nombre), new Uint8Array(40)))
  return juntar(...locales, ...(cerrado ? [Uint8Array.of(0x50, 0x4b, 0x05, 0x06), new Uint8Array(18)] : []))
}
export const PARTES_XLSX = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']
/** Un contenedor OLE2 mínimo con los nombres de sus flujos en UTF-16LE, como los guarda Office 97-2003. */
export function oleConFlujos(...flujos: string[]): Bytes {
  const utf16 = (texto: string) => codificar([...texto].join('\0') + '\0')
  return juntar(Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), new Uint8Array(504), ...flujos.map(utf16), new Uint8Array(64))
}
