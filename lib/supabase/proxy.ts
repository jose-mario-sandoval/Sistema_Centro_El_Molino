import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const RUTAS_PUBLICAS = ['/login', '/api/cron', '/sw.js', '/manifest.webmanifest', '/iconos', '/sin-conexion']

function esPublica(ruta: string) {
  return RUTAS_PUBLICAS.some((p) => ruta === p || ruta.startsWith(`${p}/`))
}

export async function actualizarSesion(request: NextRequest) {
  let respuesta = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesAGuardar) {
          cookiesAGuardar.forEach(({ name, value }) => request.cookies.set(name, value))
          respuesta = NextResponse.next({ request })
          cookiesAGuardar.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options))
        },
      },
    },
  )

  // No poner código entre createServerClient y getClaims (refresca la sesión).
  const { data } = await supabase.auth.getClaims()
  const conSesion = Boolean(data?.claims?.sub)
  const ruta = request.nextUrl.pathname

  if (!conSesion && !esPublica(ruta)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Con sesión NO se redirige /login aquí: una cuenta desactivada conserva cookies y
  // el layout la manda a /login; redirigirla de vuelta causaría un bucle.
  // La página /login redirige solo si el perfil está activo (tarea 11).
  return respuesta
}
