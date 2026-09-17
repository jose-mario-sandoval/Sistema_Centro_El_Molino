import { NextResponse, type NextRequest } from 'next/server'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { esquemaBajaPush, esquemaSuscripcionPush } from '@/lib/validacion/push'

async function leerJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/** Registra la suscripción de este dispositivo o la reasigna a la cuenta con sesión. */
export async function POST(request: NextRequest) {
  const permiso = await perfilParaAccion()
  if (!permiso.ok) return NextResponse.json({ error: permiso.error }, { status: 401 })

  const entrada = esquemaSuscripcionPush.safeParse(await leerJson(request))
  if (!entrada.success) return NextResponse.json({ error: 'La suscripción no es válida.' }, { status: 400 })

  const { endpoint, keys } = entrada.data
  const { error } = await crearClienteAdmin()
    .from('suscripciones_push')
    .upsert(
      { usuario_id: permiso.perfil.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: 'endpoint' },
    )
  if (error) {
    console.error('[push] no se pudo guardar la suscripción', error)
    return NextResponse.json({ error: 'No se pudo registrar este dispositivo.' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}

/** Borra la suscripción de este dispositivo, solo si es de la cuenta con sesión. */
export async function DELETE(request: NextRequest) {
  const permiso = await perfilParaAccion()
  if (!permiso.ok) return NextResponse.json({ error: permiso.error }, { status: 401 })

  const entrada = esquemaBajaPush.safeParse(await leerJson(request))
  if (!entrada.success) return NextResponse.json({ error: 'El dispositivo no es válido.' }, { status: 400 })

  const { error } = await crearClienteAdmin()
    .from('suscripciones_push')
    .delete()
    .eq('endpoint', entrada.data.endpoint)
    .eq('usuario_id', permiso.perfil.id)
  if (error) {
    console.error('[push] no se pudo borrar la suscripción', error)
    return NextResponse.json({ error: 'No se pudo dar de baja este dispositivo.' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
