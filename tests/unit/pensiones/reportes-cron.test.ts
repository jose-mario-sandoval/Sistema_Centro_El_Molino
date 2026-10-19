import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/cron/pensiones-reportes/route'
import { limpiarArchivosReportes } from '@/lib/pensiones/reportes-limpieza'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/pensiones/reportes-limpieza', () => ({ limpiarArchivosReportes: vi.fn() }))
function peticion(secreto = '') { return new NextRequest('https://molino.test/api/cron/pensiones-reportes', { method: 'POST', headers: { authorization: secreto } }) }
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'secreto-cron-prueba')
  vi.mocked(limpiarArchivosReportes).mockResolvedValue({ eliminados: 1, pendientes: 0 })
})

describe('trabajador de reportes', () => {
  it('rechaza llamadas sin el secreto antes de usar privilegios', async () => {
    expect((await POST(peticion())).status).toBe(401)
    expect((await POST(peticion('Bearer incorrecto'))).status).toBe(401)
    expect(limpiarArchivosReportes).not.toHaveBeenCalled()
  })
  it('confirma sólo una limpieza completa y permite reintentar tareas fallidas', async () => {
    expect((await POST(peticion('Bearer secreto-cron-prueba'))).status).toBe(200)
    vi.mocked(limpiarArchivosReportes).mockResolvedValue({ eliminados: 0, pendientes: 1 })
    expect((await POST(peticion('Bearer secreto-cron-prueba'))).status).toBe(503)
  })
})
