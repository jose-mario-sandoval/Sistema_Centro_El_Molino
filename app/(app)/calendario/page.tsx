import Link from 'next/link'
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
  mesSiguiente,
} from '@/lib/calendario/cuadricula'
import { fechaISOEn } from '@/lib/fechas'
import { CalendarioMes } from './_componentes/calendario-mes'

export default async function PaginaCalendario({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>
}) {
  const perfil = await exigirPerfil()
  const { mes: mesPedido } = await searchParams

  const hoy = fechaISOEn(new Date())
  const mesDeHoy = mesDe(hoy)
  const mes = esMesISO(mesPedido) ? mesPedido : mesDeHoy
  const puedeEditar = perfil.rol === 'director'

  const eventos = await listarEventosDeCuadricula(mes)
  const dias = cuadriculaMes(mes).map((dia) => ({ ...dia, etiqueta: etiquetaDia(dia.fecha) }))

  return (
    <>
      <div className="page-head">
        <h1>Calendario</h1>
        <div className="desc">
          {puedeEditar
            ? 'Eventos de la casa. Tocá un día para agregar, editar o eliminar eventos.'
            : 'Vista de solo lectura de los eventos de la casa. Tocá un día para ver sus eventos.'}
        </div>
      </div>
      <div className="card">
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
        <CalendarioMes dias={dias} eventosPorFecha={agruparPorFecha(eventos)} hoy={hoy} puedeEditar={puedeEditar} />
      </div>
    </>
  )
}
