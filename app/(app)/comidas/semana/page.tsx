import { exigirPerfil } from '@/lib/auth/sesion'
import { obtenerExtrasDeLaSemana, obtenerSemanaParaAdministracion, obtenerSemanaPropia } from '@/lib/comidas/consultas'
import { semanaPedida, tipoSemana } from '@/lib/comidas/semana'
import { fechaISOEn } from '@/lib/fechas'
import { NavegacionSemana } from '../_componentes/navegacion-semana'
import { RefrescarAlVolver } from '../_componentes/refrescar-al-volver'
import { SemanaAgregadaAdministracion } from '../_componentes/semana-agregada-administracion'
import { SemanaPersona } from '../_componentes/semana-persona'

export default async function PaginaSemana({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>
}) {
  const perfil = await exigirPerfil()
  const { semana } = await searchParams

  const hoy = fechaISOEn(new Date())
  const lunes = semanaPedida(semana, hoy)

  if (perfil.rol === 'administracion') {
    const [dias, extras] = await Promise.all([obtenerSemanaParaAdministracion(lunes), obtenerExtrasDeLaSemana(lunes)])
    return (
      <>
        {/* La vieja SemanaAdministracion la traía adentro: sin esto, Administración no ve los cierres
            del job de cada 5 minutos hasta que recargue a mano. */}
        <RefrescarAlVolver />
        <NavegacionSemana lunes={lunes} hoy={hoy} />
        <SemanaAgregadaAdministracion dias={dias} extras={extras} />
      </>
    )
  }

  const dias = await obtenerSemanaPropia(perfil.id, lunes)
  return (
    <>
      {/* Al volver a la pestaña, trae cierres y cambios hechos mientras tanto. */}
      <RefrescarAlVolver />
      <NavegacionSemana lunes={lunes} hoy={hoy} />
      <SemanaPersona dias={dias} tipo={tipoSemana(lunes, hoy)} lunes={lunes} />
    </>
  )
}
