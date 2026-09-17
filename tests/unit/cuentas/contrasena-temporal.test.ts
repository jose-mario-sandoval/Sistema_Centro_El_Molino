import { describe, expect, it } from 'vitest'
import { ALFABETO_CONTRASENA, generarContrasenaTemporal } from '@/lib/cuentas/contrasena-temporal'

const FORMATO = /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/

describe('generarContrasenaTemporal', () => {
  it('genera 12 símbolos legibles en tres grupos de 4', () => {
    const contrasena = generarContrasenaTemporal()
    expect(contrasena).toMatch(FORMATO)
    expect(contrasena.replaceAll('-', '')).toHaveLength(12)
  })

  it('no usa caracteres que se confunden al dictarlos o copiarlos', () => {
    for (const ambiguo of ['0', 'o', 'O', '1', 'l', 'i', 'I']) {
      expect(ALFABETO_CONTRASENA).not.toContain(ambiguo)
    }
  })

  it('no repite contraseñas', () => {
    const generadas = new Set(Array.from({ length: 500 }, () => generarContrasenaTemporal()))
    expect(generadas.size).toBe(500)
  })

  it('descarta los bytes que sesgarían la distribución', () => {
    // 31 símbolos: se aceptan bytes 0–247 (248 = 8 × 31); 248 y 255 se descartan.
    const bytes = [255, 248, 247, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    let posicion = 0
    const fuente = (cantidad: number) => Uint8Array.from({ length: cantidad }, () => bytes[posicion++ % bytes.length])
    expect(generarContrasenaTemporal(fuente)).toBe('9abc-defg-hjkm')
  })
})
