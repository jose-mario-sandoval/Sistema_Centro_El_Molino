import { PaginaProvisional } from '@/components/app/pagina-provisional'
import { exigirPerfil } from '@/lib/auth/sesion'

export default async function Pagina() {
  await exigirPerfil()
  return <PaginaProvisional titulo="Configuraciones" />
}
