import { exigirPerfil } from '@/lib/auth/sesion'
import { obtenerExtrasDeLaSemana, obtenerSemanaDe, obtenerSemanaParaAdministracion } from '@/lib/comidas/consultas'
import { semanaPedida, tipoSemana } from '@/lib/comidas/semana'
import { diaParaAbrir } from '@/lib/comidas/vista'
import { fechaISOEn, sumarDias } from '@/lib/fechas'
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

  const dias = await obtenerSemanaDe(perfil.id, lunes)
  const tipo = tipoSemana(lunes, hoy)
  return (
    <>
      {/* Al volver a la pestaña, trae cierres y cambios hechos mientras tanto. */}
      <RefrescarAlVolver />
      <NavegacionSemana lunes={lunes} hoy={hoy} />
      {/* key: al cambiar de semana, la tarjeta abierta vuelve a empezar desde el día que corresponde. */}
      <SemanaPersona
        key={lunes}
        dias={dias}
        tipo={tipo}
        diaInicial={tipo === 'actual' ? diaParaAbrir(dias) : null}
        hrefSiguienteSemana={tipo === 'actual' ? `/comidas/semana?semana=${sumarDias(lunes, 7)}` : null}
      />
    </>
  )
}
