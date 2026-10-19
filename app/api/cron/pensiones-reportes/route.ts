import { NextResponse, type NextRequest } from 'next/server'
import { secretoCronValido } from '@/lib/push/autorizacion-cron'
import { limpiarArchivosReportes } from '@/lib/pensiones/reportes-limpieza'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  if (!secretoCronValido(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  try {
    const resultado = await limpiarArchivosReportes()
    return NextResponse.json(resultado, { status: resultado.pendientes ? 503 : 200 })
  } catch (error) {
    console.error('[pensiones] No se pudo limpiar la cola de reportes', error)
    return NextResponse.json({ error: 'No se pudo completar la limpieza.' }, { status: 503 })
  }
}
