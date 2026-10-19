import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Icono } from '@/components/ui/iconos'
import { exigirPerfil } from '@/lib/auth/sesion'
import { listarEventosDeCuadricula } from '@/lib/calendario/consultas'
import {
  agruparPorFecha,
  cuadriculaMes,
  esMesISO,
  etiquetaDia,
  etiquetaMes,
  mesAnterior,
  mesDe,
  mesDesdeSeleccion,
  mesSiguiente,
} from '@/lib/calendario/cuadricula'
import { fechaISOEn } from '@/lib/fechas'
import { listarAusenciasDe } from '@/lib/ausencias/consultas'
import { esAdministracion } from '@/lib/perfiles/roles'
import { CalendarioMes } from './_componentes/calendario-mes'
import { PanelAusencias } from './_componentes/panel-ausencias'
import { SelectorMes } from './_componentes/selector-mes'

export default async function PaginaCalendario({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>
}) {
  const perfil = await exigirPerfil()
  const { mes: mesPedido, anio, m } = await searchParams

  // "Elegir mes y año" es un formulario GET: acá se lo lleva a la dirección de siempre (?mes=AAAA-MM).
  const elegido = mesDesdeSeleccion(anio, m)
  if (elegido) redirect(`/calendario?mes=${elegido}`)

  const hoy = fechaISOEn(new Date())
  const mesDeHoy = mesDe(hoy)
  const mes = esMesISO(mesPedido) ? mesPedido : mesDeHoy
  const puedeEditar = perfil.rol === 'director'

  // Las ausencias son de quienes comen en la casa; Administración no las marca ni las ve.
  const conAusencias = !esAdministracion(perfil.rol)
  const [eventos, ausencias] = await Promise.all([
    listarEventosDeCuadricula(mes, perfil.rol),
    conAusencias ? listarAusenciasDe(perfil.id, hoy) : Promise.resolve([]),
  ])
  const dias = cuadriculaMes(mes).map((dia) => ({ ...dia, etiqueta: etiquetaDia(dia.fecha) }))

  return (
    <>
      <div className="page-head">
        <h1>Calendario</h1>
        <div className="desc">
          {puedeEditar
            ? 'Eventos de la casa. Tocá un día para agregar, editar o eliminar eventos.'
            : esAdministracion(perfil.rol)
              ? 'Lo que la casa necesita de la cocina: cuándo y qué preparar. Tocá un día para ver el detalle.'
              : 'Vista de solo lectura de los eventos de la casa. Tocá un día para ver sus eventos.'}
        </div>
      </div>
      {conAusencias && <PanelAusencias ausencias={ausencias} hoy={hoy} plegable />}
      {/* Los filtros (Director y Residente) van arriba de la tarjeta; el mes y sus flechas, dentro. */}
      <CalendarioMes
        cabecera={
          <>
          <div className="cal-head">
            <div className="month-label">{etiquetaMes(mes)}</div>
            <div className="cal-nav-btns">
              {mes !== mesDeHoy && (
                <Link href="/calendario" className="btn ghost">
                  Hoy
                </Link>
              )}
              <Link href={`/calendario?mes=${mesAnterior(mes)}`} className="icon-btn" aria-label="Mes anterior">
                <Icono nombre="izquierda" />
              </Link>
              <Link href={`/calendario?mes=${mesSiguiente(mes)}`} className="icon-btn" aria-label="Mes siguiente">
                <Icono nombre="derecha" />
              </Link>
            </div>
          </div>
          <SelectorMes mes={mes} hoy={hoy} />
          </>
        }
        dias={dias}
        eventosPorFecha={agruparPorFecha(eventos)}
        hoy={hoy}
        puedeEditar={puedeEditar}
        paraCocina={esAdministracion(perfil.rol)}
        ausencias={ausencias}
        // Administración no tiene filtros: ve todo lo que le piden, con su categoría.
        conFiltros={conAusencias}
      />
    </>
  )
}
