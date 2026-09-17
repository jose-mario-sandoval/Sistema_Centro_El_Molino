import { exigirPerfil } from '@/lib/auth/sesion'
import { obtenerDiaParaAdministracion, obtenerSemanaPropia } from '@/lib/comidas/consultas'
import { diaPedido, semanaPedida, tipoSemana } from '@/lib/comidas/semana'
import { fechaISOEn } from '@/lib/fechas'
import { NavegacionSemana } from '../_componentes/navegacion-semana'
import { SemanaAdministracion } from '../_componentes/semana-administracion'
import { SemanaPersona } from '../_componentes/semana-persona'

export default async function PaginaSemana({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>
}) {
  const perfil = await exigirPerfil()
  const { semana, dia } = await searchParams

  const hoy = fechaISOEn(new Date())
  const lunes = semanaPedida(semana, hoy)

  if (perfil.rol === 'administracion') {
    const datos = await obtenerDiaParaAdministracion(diaPedido(dia, lunes, hoy))
    return (
      <>
        <NavegacionSemana lunes={lunes} hoy={hoy} />
        <SemanaAdministracion lunes={lunes} hoy={hoy} datos={datos} />
      </>
    )
  }

  const dias = await obtenerSemanaPropia(perfil.id, lunes)
  return (
    <>
      <NavegacionSemana lunes={lunes} hoy={hoy} />
      <SemanaPersona dias={dias} tipo={tipoSemana(lunes, hoy)} />
    </>
  )
}
