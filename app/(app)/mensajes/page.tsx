import Link from 'next/link'
import { InsigniaPendientes } from '@/components/app/pendientes'
import { exigirPerfil, type Perfil } from '@/lib/auth/sesion'
import { listarMensajesPendientes, listarPublicaciones, listarRegistroModeracion, obtenerPublicacion } from '@/lib/mensajes/consultas'
import { agregarAnteriores } from '@/lib/mensajes/feed'
import { listarPerfiles } from '@/lib/perfiles/consultas'
import { esquemaCargarPublicacion } from '@/lib/validacion/mensajes'
import { ColaModeracion } from './_componentes/cola-moderacion'
import { FeedMensajes } from './_componentes/feed-mensajes'
import { RefrescarColaAlCambiar } from './_componentes/refrescar-cola'
import { TablaRegistro } from './_componentes/tabla-registro'

/** Fuera de los componentes: la marca `generadoEn` no es una lectura pura de render. */
async function datosFeed(hiloId: string | null) {
  const [pagina, perfiles, hilo] = await Promise.all([
    listarPublicaciones(), listarPerfiles(), hiloId ? obtenerPublicacion(hiloId) : Promise.resolve(null),
  ])
  // Un aviso puede enlazar a un hilo anterior a la primera página. La consulta conserva RLS y el cursor original.
  if (hilo) pagina.publicaciones = agregarAnteriores(pagina.publicaciones, [hilo])
  return { pagina, perfiles, generadoEn: new Date().toISOString() }
}

async function SeccionFeed({ perfil, hiloId }: { perfil: Perfil; hiloId: string | null }) {
  const { pagina, perfiles, generadoEn } = await datosFeed(hiloId)
  return (
    <FeedMensajes
      key={hiloId}
      inicial={pagina}
      perfiles={perfiles}
      usuario={{ id: perfil.id, rol: perfil.rol }}
      generadoEn={generadoEn}
      hiloId={hiloId}
    />
  )
}

async function SeccionRegistro() {
  const [pagina, perfiles] = await Promise.all([listarRegistroModeracion(), listarPerfiles()])
  return <TablaRegistro key={pagina.entradas.map((e) => e.id).join(',')} inicial={pagina} perfiles={perfiles} />
}

async function SeccionPendientes() {
  const [mensajes, perfiles] = await Promise.all([listarMensajesPendientes(), listarPerfiles()])
  return (
    <>
      <RefrescarColaAlCambiar />
      <ColaModeracion mensajes={mensajes} perfiles={perfiles} />
    </>
  )
}

export default async function PaginaMensajes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const perfil = await exigirPerfil()
  const { vista, hilo } = await searchParams
  const enlace = esquemaCargarPublicacion.safeParse({ id: hilo })
  const hiloId = enlace.success ? enlace.data.id : null
  const esDirector = perfil.rol === 'director'
  const verRegistro = esDirector && vista === 'registro'
  const verPendientes = esDirector && vista === 'pendientes'
  const verFeed = !verRegistro && !verPendientes

  return (
    <>
      <div className="page-head">
        <h1>Mensajes</h1>
        <div className="desc">Publicaciones y comentarios de toda la casa.</div>
      </div>

      {esDirector && (
        <nav className="tabs" aria-label="Vistas de Mensajes">
          <Link
            href="/mensajes"
            className={`tab-btn${verFeed ? ' active' : ''}`}
            aria-current={verFeed ? 'page' : undefined}
          >
            Publicaciones
          </Link>
          <Link
            href="/mensajes?vista=pendientes"
            className={`tab-btn${verPendientes ? ' active' : ''}`}
            aria-current={verPendientes ? 'page' : undefined}
          >
            Pendientes
            <InsigniaPendientes />
          </Link>
          <Link
            href="/mensajes?vista=registro"
            className={`tab-btn${verRegistro ? ' active' : ''}`}
            aria-current={verRegistro ? 'page' : undefined}
          >
            Registro de moderación
          </Link>
        </nav>
      )}

      {verRegistro ? <SeccionRegistro /> : verPendientes ? <SeccionPendientes /> : <SeccionFeed perfil={perfil} hiloId={hiloId} />}
    </>
  )
}
