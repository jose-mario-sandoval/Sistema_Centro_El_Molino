import { describe, expect, it } from 'vitest'
import { CATEGORIAS_REPORTE, ETIQUETA_REPORTE, disposicionDescarga, MAX_BYTES_REPORTE, MAX_REPORTES_POR_CATEGORIA, nombreReporteSeguro, puedeConsultarReportes, puedeSubirReportes } from '@/lib/pensiones/reportes'
import { tieneFirmaPDF, validarCargaReporte } from '@/lib/validacion/reportes-pensiones'

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
    expect(resultado).toEqual({ ok: false, error: 'El PDF debe pesar como máximo 3 MiB.' })
  })

  it('el nombre no introduce rutas ni cabeceras de respuesta', () => {
    expect(nombreReporteSeguro('../estado\r\n.pdf')).toBe('.._estado__.pdf')
    const disposicion = disposicionDescarga('Finanzas año.pdf\r\nX-Test: sí')
    expect(disposicion).not.toMatch(/[\r\n]/)
    expect(disposicion).toContain("filename*=UTF-8''Finanzas%20a%C3%B1o")
    expect(nombreReporteSeguro('x'.repeat(181))).toHaveLength(180)
  })
})
