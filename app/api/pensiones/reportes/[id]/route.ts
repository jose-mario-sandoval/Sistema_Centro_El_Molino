import { NextResponse } from 'next/server'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { BUCKET_REPORTES, disposicionDescarga } from '@/lib/pensiones/reportes'

export const dynamic = 'force-dynamic'

/** No expone URLs firmadas reutilizables: sesión, cuenta activa y rol se comprueban en cada GET. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await perfilParaAccion('director', 'administradora')
  if (!permiso.ok) return NextResponse.json({ error: permiso.error }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  const { id } = await params
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Documento no disponible.' }, { status: 404 })
  }
  const cliente = await crearClienteServidor()
  const { data, error } = await cliente.from('pensiones_reportes').select('nombre, ruta').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: 'No se pudo consultar el documento.' }, { status: 503 })
  if (!data) return NextResponse.json({ error: 'Documento no disponible.' }, { status: 404 })
  const admin = crearClienteAdmin()
  const archivo = await admin.storage.from(BUCKET_REPORTES).download(data.ruta)
  if (archivo.error || !archivo.data) return NextResponse.json({ error: 'No se pudo descargar el documento. Intentá de nuevo.' }, { status: 503 })
  return new NextResponse(archivo.data, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': disposicionDescarga(data.nombre),
      'Content-Length': String(archivo.data.size),
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
    },
  })
}
