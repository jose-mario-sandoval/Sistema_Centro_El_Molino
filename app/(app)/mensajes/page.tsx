import Link from 'next/link'
import { exigirPerfil, type Perfil } from '@/lib/auth/sesion'
import { listarPublicaciones, listarRegistroModeracion } from '@/lib/mensajes/consultas'
import { listarPerfiles } from '@/lib/perfiles/consultas'
import { FeedMensajes } from './_componentes/feed-mensajes'
import { TablaRegistro } from './_componentes/tabla-registro'

/** Fuera de los componentes: la marca `generadoEn` no es una lectura pura de render. */
async function datosFeed() {
  const [pagina, perfiles] = await Promise.all([listarPublicaciones(), listarPerfiles()])
  return { pagina, perfiles, generadoEn: new Date().toISOString() }
}

async function SeccionFeed({ perfil }: { perfil: Perfil }) {
  const { pagina, perfiles, generadoEn } = await datosFeed()
  return (
    <FeedMensajes
      inicial={pagina}
      perfiles={perfiles}
      usuario={{ id: perfil.id, rol: perfil.rol }}
      generadoEn={generadoEn}
    />
  )
}

async function SeccionRegistro() {
  const [entradas, perfiles] = await Promise.all([listarRegistroModeracion(), listarPerfiles()])
  return <TablaRegistro entradas={entradas} perfiles={perfiles} />
}

export default async function PaginaMensajes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const perfil = await exigirPerfil()
  const { vista } = await searchParams
  const esDirector = perfil.rol === 'director'
  const verRegistro = esDirector && vista === 'registro'

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
            className={`tab-btn${verRegistro ? '' : ' active'}`}
            aria-current={verRegistro ? undefined : 'page'}
          >
            Publicaciones
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

      {verRegistro ? <SeccionRegistro /> : <SeccionFeed perfil={perfil} />}
    </>
  )
}
