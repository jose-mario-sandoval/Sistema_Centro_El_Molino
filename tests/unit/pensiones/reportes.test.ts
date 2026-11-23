import { describe, expect, it } from 'vitest'
import {
  ACEPTAR_REPORTES, CATEGORIAS_REPORTE, ETIQUETA_REPORTE, disposicionDescarga, etiquetaFormatoReporte, formatoReporte, FORMATOS_REPORTE,
  MAX_BYTES_REPORTE, MAX_REPORTES_POR_CATEGORIA, nombreReporteSeguro, puedeConsultarReportes, puedeSubirReportes, tipoContenidoReporte,
} from '@/lib/pensiones/reportes'
import { juntar, oleConFlujos, PARTES_XLSX, codificar, zipConPartes } from '@/tests/soporte/archivos-reporte'
import { pareceCSV, tieneFirmaPDF, tieneFirmaXLS, tieneFirmaXLSX, tieneMacrosExcel, validarCargaReporte } from '@/lib/validacion/reportes-pensiones'

const pdf = '%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n'
function formulario(contenido = pdf, categoria = 'finanzas', nombre = 'reporte.pdf') {
  const datos = new FormData()
  datos.set('categoria', categoria)
  datos.set('archivo', new File([contenido], nombre, { type: 'application/pdf' }))
  return datos
}

describe('permisos de reportes', () => {
  it('renombra solo las etiquetas y conserva las categorías y su límite de documentos', () => {
    expect(CATEGORIAS_REPORTE).toEqual(['finanzas', 'otras_utilidades'])
    expect(ETIQUETA_REPORTE).toEqual({ finanzas: 'Resúmenes Económicos', otras_utilidades: 'Otros documentos' })
    expect(MAX_REPORTES_POR_CATEGORIA).toBe(12)
  })
  it('sólo Administradora sube; Director también consulta; residentes y Administración no acceden', () => {
    for (const rol of ['director', 'residente', 'administracion', 'administradora'] as const) {
      expect(puedeConsultarReportes(rol)).toBe(rol === 'director' || rol === 'administradora')
      expect(puedeSubirReportes(rol)).toBe(rol === 'administradora')
    }
  })
})

describe('validación de PDF', () => {
  it('acepta las dos categorías independientes y devuelve los bytes verificados', async () => {
    for (const categoria of ['finanzas', 'otras_utilidades']) {
      const resultado = await validarCargaReporte(formulario(pdf, categoria))
      expect(resultado.ok).toBe(true)
      if (resultado.ok) {
        expect(resultado.data.categoria).toBe(categoria)
        expect(resultado.data.tamano).toBe(new TextEncoder().encode(pdf).length)
      }
    }
  })

  it('no confía en el nombre ni en el MIME: rechaza un texto renombrado como .pdf', async () => {
    expect((await validarCargaReporte(formulario('<html>archivo falso</html>'))).ok).toBe(false)
    expect(tieneFirmaPDF(new TextEncoder().encode('%PDF-1.7\ncontenido truncado'))).toBe(false)
    expect(tieneFirmaPDF(new TextEncoder().encode('%PDF-1.7\n%%EOF\n<script>'))).toBe(false)
  })

  it('admite PDF 2.0 e impide categorías inyectadas, archivos vacíos y extensiones equivocadas', async () => {
    expect(tieneFirmaPDF(new TextEncoder().encode(pdf.replace('1.7', '2.0')))).toBe(true)
    expect((await validarCargaReporte(formulario(pdf, '../finanzas'))).ok).toBe(false)
    expect((await validarCargaReporte(formulario(''))).ok).toBe(false)
    expect((await validarCargaReporte(formulario(pdf, 'finanzas', 'reporte.html'))).ok).toBe(false)
  })

  it('limita a 3 MiB antes de leer el contenido del archivo', async () => {
    const resultado = await validarCargaReporte(formulario('a'.repeat(MAX_BYTES_REPORTE + 1)))
    expect(resultado).toEqual({ ok: false, error: 'El archivo debe pesar como máximo 3 MiB.' })
  })

  it('el nombre no introduce rutas ni cabeceras de respuesta', () => {
    expect(nombreReporteSeguro('../estado\r\n.pdf')).toBe('.._estado__.pdf')
    const disposicion = disposicionDescarga('Finanzas año.pdf\r\nX-Test: sí')
    expect(disposicion).not.toMatch(/[\r\n]/)
    expect(disposicion).toContain("filename*=UTF-8''Finanzas%20a%C3%B1o")
    expect(nombreReporteSeguro('x'.repeat(181))).toHaveLength(180)
  })
})

function carga(contenido: Uint8Array<ArrayBuffer> | string, nombre: string, categoria = 'finanzas') {
  const datos = new FormData()
  datos.set('categoria', categoria)
  datos.set('archivo', new File([contenido], nombre, { type: 'application/octet-stream' }))
  return datos
}

describe('formatos de reporte', () => {
  it('admite PDF, Excel (.xlsx y .xls) y CSV, sin importar mayúsculas', () => {
    expect(Object.keys(FORMATOS_REPORTE)).toEqual(['pdf', 'xlsx', 'xls', 'csv'])
    expect(formatoReporte('Resumen.PDF')).toBe('pdf')
    expect(formatoReporte('Balance octubre.XLSX')).toBe('xlsx')
    expect(formatoReporte('viejo.xls')).toBe('xls')
    expect(formatoReporte('datos.csv')).toBe('csv')
  })

  it('no admite macros ni ejecutables ni nombres sin extensión', () => {
    for (const nombre of ['macros.xlsm', 'binario.xlsb', 'programa.exe', 'pagina.html', 'sin_extension', 'doble.pdf.exe', 'toString', 'archivo.constructor', '']) {
      expect(formatoReporte(nombre)).toBeNull()
    }
  })

  it('rotula cada formato y sirve cada descarga con su Content-Type; lo desconocido, como binario', () => {
    expect(etiquetaFormatoReporte('a.pdf')).toBe('PDF')
    expect(etiquetaFormatoReporte('a.xlsx')).toBe('Excel')
    expect(etiquetaFormatoReporte('a.xls')).toBe('Excel')
    expect(etiquetaFormatoReporte('a.csv')).toBe('CSV')
    expect(etiquetaFormatoReporte('a.exe')).toBe('')
    expect(tipoContenidoReporte('finanzas/id.pdf')).toBe('application/pdf')
    expect(tipoContenidoReporte('finanzas/id.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(tipoContenidoReporte('finanzas/id.xls')).toBe('application/vnd.ms-excel')
    expect(tipoContenidoReporte('finanzas/id.csv')).toBe('text/csv')
    expect(tipoContenidoReporte('finanzas/id.html')).toBe('application/octet-stream')
  })

  it('el selector de archivos ofrece extensiones y tipos MIME de todos los formatos', () => {
    for (const extension of ['.pdf', '.xlsx', '.xls', '.csv']) expect(ACEPTAR_REPORTES).toContain(extension)
    for (const { mime } of Object.values(FORMATOS_REPORTE)) expect(ACEPTAR_REPORTES).toContain(mime)
  })
})

describe('validación de Excel', () => {
  it('acepta un libro .xlsx y devuelve su formato y sus bytes', async () => {
    const bytes = zipConPartes(PARTES_XLSX)
    expect(tieneFirmaXLSX(bytes)).toBe(true)
    const resultado = await validarCargaReporte(carga(bytes, 'Balance octubre.XLSX', 'otras_utilidades'))
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.data).toMatchObject({ categoria: 'otras_utilidades', nombre: 'Balance octubre.XLSX', formato: 'xlsx', tamano: bytes.length })
    }
  })

  it('rechaza un .xlsx que en realidad es otra cosa: texto, un Word (.docx), un ZIP cualquiera o uno cortado', async () => {
    const docx = zipConPartes(['[Content_Types].xml', '_rels/.rels', 'word/document.xml'])
    const zipCualquiera = zipConPartes(['foto.png', 'notas.txt'])
    const cortado = zipConPartes(PARTES_XLSX, { cerrado: false })
    for (const falso of [codificar('Esto no es un Excel'), docx, zipCualquiera, cortado]) {
      expect(tieneFirmaXLSX(falso)).toBe(false)
      expect(await validarCargaReporte(carga(falso, 'balance.xlsx'))).toEqual({
        ok: false, error: 'El archivo no es un Excel (.xlsx) válido. Abrilo en Excel, guardalo de nuevo e intentá otra vez.',
      })
    }
  })

  it('acepta un libro .xls antiguo y rechaza un Word (.doc), un PowerPoint o un PDF con esa extensión', async () => {
    const xls = oleConFlujos('Root Entry', 'Workbook', 'SummaryInformation')
    const xls95 = oleConFlujos('Root Entry', 'Book')
    expect(tieneFirmaXLS(xls)).toBe(true)
    expect(tieneFirmaXLS(xls95)).toBe(true)
    const resultado = await validarCargaReporte(carga(xls, 'viejo.xls'))
    expect(resultado.ok && resultado.data.formato).toBe('xls')
    for (const falso of [oleConFlujos('Root Entry', 'WordDocument'), oleConFlujos('Root Entry', 'PowerPoint Document'), codificar(pdf)]) {
      expect(tieneFirmaXLS(falso)).toBe(false)
      expect(await validarCargaReporte(carga(falso, 'viejo.xls'))).toMatchObject({ ok: false, error: expect.stringContaining('no es un Excel (.xls) válido') })
    }
  })

  it('rechaza libros con macros aunque lleven extensión .xlsx o .xls', async () => {
    const conMacros = zipConPartes([...PARTES_XLSX, 'xl/vbaProject.bin'])
    const antiguoConMacros = oleConFlujos('Root Entry', 'Workbook', '_VBA_PROJECT_CUR', '_VBA_PROJECT')
    expect(tieneMacrosExcel(conMacros)).toBe(true)
    expect(tieneMacrosExcel(antiguoConMacros)).toBe(true)
    expect(tieneMacrosExcel(zipConPartes(PARTES_XLSX))).toBe(false)
    for (const [bytes, nombre] of [[conMacros, 'con-macros.xlsx'], [antiguoConMacros, 'con-macros.xls']] as const) {
      expect(await validarCargaReporte(carga(bytes, nombre))).toEqual({
        ok: false, error: 'No se aceptan archivos de Excel con macros. Guardalo como libro de Excel normal (.xlsx) e intentá otra vez.',
      })
    }
  })

  it('una celda con el texto "VBA" no se confunde con un proyecto de macros', async () => {
    const normal = juntar(zipConPartes(PARTES_XLSX), codificar('Balance VBA de la casa'))
    expect(tieneMacrosExcel(normal)).toBe(false)
  })

  it('.xlsm, .xlsb y otros formatos no entran, y el mensaje explica qué se acepta', async () => {
    for (const nombre of ['macros.xlsm', 'binario.xlsb', 'pagina.html', 'programa.exe', 'sin_extension']) {
      expect(await validarCargaReporte(carga(zipConPartes(PARTES_XLSX), nombre))).toEqual({
        ok: false, error: 'El archivo debe ser PDF o Excel (.pdf, .xlsx, .xls o .csv). Si es Excel con macros (.xlsm), guardalo como .xlsx.',
      })
    }
  })
})

describe('validación de CSV', () => {
  it('acepta texto plano en UTF-8, en Windows-1252 y con saltos de línea de Windows', async () => {
    const utf8 = codificar('Concepto;Monto\r\nPensión de octubre;300.00\r\nDonación;150.00\r\n')
    const windows1252 = Uint8Array.of(...codificar('Concepto,Monto\nPensi'), 0xf3, ...codificar('n,300.00\n'))
    for (const bytes of [utf8, windows1252, codificar('a\tb\tc\n1\t2\t3\n')]) expect(pareceCSV(bytes)).toBe(true)
    const resultado = await validarCargaReporte(carga(utf8, 'Octubre.CSV'))
    expect(resultado.ok && resultado.data.formato).toBe('csv')
  })

  it('rechaza un binario con extensión .csv: bytes nulos, un Excel, un PDF con firma o texto UTF-16', async () => {
    const utf16 = Uint8Array.of(0xff, 0xfe, 0x41, 0x00, 0x2c, 0x00, 0x42, 0x00)
    for (const falso of [Uint8Array.of(0x61, 0x2c, 0x00, 0x62), zipConPartes(PARTES_XLSX), oleConFlujos('Workbook'), utf16, Uint8Array.of(0x1b, 0x5b, 0x41)]) {
      expect(pareceCSV(falso)).toBe(false)
      expect(await validarCargaReporte(carga(falso, 'datos.csv'))).toMatchObject({ ok: false, error: expect.stringContaining('no parece un CSV') })
    }
    expect(pareceCSV(new Uint8Array())).toBe(false)
  })
})

describe('validación común a todos los formatos', () => {
  it('el límite de 3 MiB y los archivos vacíos valen para Excel y CSV igual que para PDF', async () => {
    expect(await validarCargaReporte(carga('a'.repeat(MAX_BYTES_REPORTE + 1), 'enorme.csv'))).toEqual({ ok: false, error: 'El archivo debe pesar como máximo 3 MiB.' })
    expect(await validarCargaReporte(carga('', 'vacio.xlsx'))).toEqual({ ok: false, error: 'Elegí el archivo que querés subir (PDF o Excel).' })
    expect((await validarCargaReporte(carga(zipConPartes(PARTES_XLSX), 'balance.xlsx', '../finanzas'))).ok).toBe(false)
  })

  it('el nombre no introduce rutas ni cabeceras en un Excel o CSV', () => {
    expect(nombreReporteSeguro('../Balance\r\n.xlsx')).toBe('.._Balance__.xlsx')
    expect(disposicionDescarga('Balance año.xlsx\r\nX-Test: sí')).not.toMatch(/[\r\n]/)
    expect(disposicionDescarga('')).toContain('filename="reporte"')
  })
})
