import { after, NextResponse, type NextRequest } from 'next/server'
import { fechaISOEn, sumarDias } from '@/lib/fechas'
import { secretoCronValido } from '@/lib/push/autorizacion-cron'
import { enviarRecordatorio } from '@/lib/push/avisos'
import { comidasPorAvisar, horasLimiteDesdeFilas, type ComidaPorAvisar } from '@/lib/push/recordatorios'
import { crearClienteAdmin } from '@/lib/supabase/admin'

/** Los envíos de after() ocurren después de responder 202: hay que darles margen (por defecto son 15 s). */
export const maxDuration = 60

/** Llamada por pg_cron + pg_net cada 5 minutos (public.llamar_recordatorios). */
export async function POST(request: NextRequest) {
  const secreto = process.env.CRON_SECRET
  // Sin la variable, la ruta rechaza todo: queda en los logs para que el dueño lo note (spec §9.1).
  if (!secreto) console.error('[cron] recordatorios: falta CRON_SECRET; no se atiende ninguna llamada')
  if (!secretoCronValido(request.headers.get('authorization'), secreto)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const ahora = new Date()
  const desde = fechaISOEn(ahora)
  const hasta = sumarDias(desde, 2)
  const admin = crearClienteAdmin()

  const [horas, cerradas, avisadas] = await Promise.all([
    admin.from('horas_limite').select('comida, dia_relativo, hora'),
    admin.from('comidas_cerradas').select('fecha, comida').gte('fecha', desde).lte('fecha', hasta),
    admin.from('avisos_enviados').select('fecha, comida').gte('fecha', desde).lte('fecha', hasta),
  ])
  if (horas.error || cerradas.error || avisadas.error) {
    console.error('[cron] recordatorios: no se pudieron leer los datos', horas.error ?? cerradas.error ?? avisadas.error)
    return NextResponse.json({ error: 'No se pudieron leer los datos' }, { status: 500 })
  }

  const candidatas = comidasPorAvisar({
    ahora,
    horas: horasLimiteDesdeFilas(horas.data),
    cerradas: cerradas.data,
    avisadas: avisadas.data,
  })

  // Primero se registra el aviso; solo se envía lo que esta corrida logró insertar.
  const tomadas: ComidaPorAvisar[] = []
  for (const candidata of candidatas) {
    const { error } = await admin.from('avisos_enviados').insert({ fecha: candidata.fecha, comida: candidata.comida })
    if (!error) {
      tomadas.push(candidata)
    } else if (error.code !== '23505') {
      // 23505 = otra corrida ya tomó esta comida; cualquier otro error se registra.
      console.error('[cron] recordatorios: no se pudo registrar el aviso', { ...candidata, error })
    }
  }

  if (tomadas.length > 0) {
    // En paralelo: enviarRecordatorio nunca lanza, y en serie varias comidas podrían no llegar a enviarse.
    after(async () => {
      await Promise.all(tomadas.map((c) => enviarRecordatorio(c.fecha, c.comida, c.cierre)))
    })
  }

  return NextResponse.json({ avisos: tomadas.map(({ fecha, comida }) => ({ fecha, comida })) }, { status: 202 })
}
