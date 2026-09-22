import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const RUTAS_PUBLICAS = ['/login', '/api/cron', '/sw.js', '/manifest.webmanifest', '/iconos', '/apple-icon', '/sin-conexion', '/confirmar-cena']

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
        setAll(cookiesAGuardar, cabeceras) {
          cookiesAGuardar.forEach(({ name, value }) => request.cookies.set(name, value))
          respuesta = NextResponse.next({ request })
          cookiesAGuardar.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options))
          // @supabase/ssr manda Cache-Control/Expires/Pragma para que ninguna caché comparta la sesión.
          Object.entries(cabeceras ?? {}).forEach(([clave, valor]) => respuesta.headers.set(clave, valor))
        },
      },
    },
  )

  // No poner código entre createServerClient y getClaims (refresca la sesión).
  const { data } = await supabase.auth.getClaims()
  const conSesion = Boolean(data?.claims?.sub)
  const ruta = request.nextUrl.pathname

  if (!conSesion && !esPublica(ruta)) {
    if (ruta.startsWith('/api/')) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

    // Server Action (POST con next-action): un redirect aquí rompe la respuesta en el cliente.
    // Se deja pasar para que la acción devuelva su propio fallo(...) o haga redirect().
    // Por eso el proxy NO es la barrera de autenticación: toda página llama a exigirPerfil()
    // y toda acción o ruta a perfilParaAccion() (índice §3.3).
    if (request.method === 'POST' && request.headers.has('next-action')) return respuesta

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
