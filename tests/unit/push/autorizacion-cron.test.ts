import { describe, expect, it } from 'vitest'
import { secretoCronValido } from '@/lib/push/autorizacion-cron'

describe('secretoCronValido', () => {
  it('acepta "Bearer <secreto>" exacto', () => {
    expect(secretoCronValido('Bearer abc123', 'abc123')).toBe(true)
  })

  it('rechaza secretos distintos, de otro largo o sin "Bearer"', () => {
    expect(secretoCronValido('Bearer abc124', 'abc123')).toBe(false)
    expect(secretoCronValido('Bearer abc1234', 'abc123')).toBe(false)
    expect(secretoCronValido('abc123', 'abc123')).toBe(false)
  })

  it('rechaza si falta la cabecera o el secreto del servidor', () => {
    expect(secretoCronValido(null, 'abc123')).toBe(false)
    expect(secretoCronValido('Bearer ', '')).toBe(false)
    expect(secretoCronValido('Bearer abc123', undefined)).toBe(false)
  })
})
