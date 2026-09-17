import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAXIMO_FILAS_API } from '@/lib/mensajes/consulta-feed'

describe('MAXIMO_FILAS_API', () => {
  it('coincide con max_rows de supabase/config.toml', () => {
    // Si max_rows bajara sin cambiar la constante, una lista de respuestas cortada no se detectaría.
    const config = readFileSync(new URL('../../../supabase/config.toml', import.meta.url), 'utf8')
    const maxRows = /^max_rows\s*=\s*(\d+)\s*$/m.exec(config)?.[1]
    expect(maxRows).toBeDefined()
    expect(Number(maxRows)).toBe(MAXIMO_FILAS_API)
  })
})
