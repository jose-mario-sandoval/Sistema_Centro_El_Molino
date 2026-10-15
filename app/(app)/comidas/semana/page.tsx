import { exigirPerfil } from '@/lib/auth/sesion'
import { notasPorComida } from '@/lib/comidas/casa'
import {
  obtenerExtrasDeLaSemana,
  obtenerNotasExtras,
  obtenerSemanaDe,
  obtenerSemanaParaAdministracion,
} from '@/lib/comidas/consultas'
import { semanaPedida, tipoSemana } from '@/lib/comidas/semana'
import { periodoEditable } from '@/lib/comidas/periodo'
import { diaParaMostrar } from '@/lib/comidas/vista'
import { fechaISOEn, instanteEnZona, sumarDias } from '@/lib/fechas'
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

  const ahora = new Date()
  const hoy = fechaISOEn(ahora)
  const refrescarEnMs = instanteEnZona(sumarDias(hoy, 1), '00:00').getTime() - ahora.getTime()
  const lunes = semanaPedida(semana, hoy)

  if (perfil.rol === 'administracion') {
    const [dias, extras, extrasManuales] = await Promise.all([
      obtenerSemanaParaAdministracion(lunes),
      obtenerExtrasDeLaSemana(lunes),
      obtenerNotasExtras(lunes),
    ])
    return (
      <>
        {/* La vieja SemanaAdministracion la traía adentro: sin esto, Administración no ve los cierres
            del job de cada 5 minutos hasta que recargue a mano. */}
        <RefrescarAlVolver refrescarEnMs={refrescarEnMs} />
        <NavegacionSemana lunes={lunes} hoy={hoy} />
        {/* Las notas de los extras del Director, sin quién los agregó: la cocina no conoce nombres. */}
        <SemanaAgregadaAdministracion dias={dias} extras={extras} notas={notasPorComida(extrasManuales)} />
      </>
    )
  }

  const dias = await obtenerSemanaDe(perfil.id, lunes, ahora)
  const tipo = tipoSemana(lunes, hoy)
  return (
    <>
      {/* Al volver a la pestaña, trae cierres y cambios hechos mientras tanto. */}
      <RefrescarAlVolver refrescarEnMs={refrescarEnMs} />
      <NavegacionSemana lunes={lunes} hoy={hoy} />
      {/* key: al cambiar de semana, la burbuja abierta se cierra y la página empieza en el día que corresponde. */}
      <SemanaPersona
        key={lunes}
        dias={dias}
        tipo={tipo}
        hastaEditable={periodoEditable(hoy).hasta}
        diaAlEntrar={tipo === 'actual' ? diaParaMostrar(dias) : null}
        hrefSiguienteSemana={tipo === 'actual' ? `/comidas/semana?semana=${sumarDias(lunes, 7)}` : null}
      />
    </>
  )
}
