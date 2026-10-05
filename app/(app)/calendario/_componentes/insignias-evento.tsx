import { Icono, type NombreIcono } from '@/components/ui/iconos'
import {
  ETIQUETA_REQUERIMIENTO,
  ETIQUETA_TIPO,
  REQUERIMIENTOS_COCINA,
  varsTipo,
  type Evento,
  type RequerimientoCocina,
} from '@/lib/calendario/tipos'
import { MarcaTipo } from './marca-tipo'

/** 'comida' usa el icono del plato, que ya existe en la navegación. */
const ICONO: Record<RequerimientoCocina, NombreIcono> = { merienda: 'merienda', comida: 'comidas', materiales: 'materiales' }

/**
 * De qué tipo es el evento (en su color, con su marca) y qué le pide a la cocina. `soloTipo`
 * (Administración): su título ya es el resumen de lo que debe preparar, así que el pedido no se
 * repite en pastillas. `oculto`: el evento está oculto por los filtros y se ve porque se pidió en el día.
 */
export function InsigniasEvento({
  evento,
  oculto = false,
  soloTipo = false,
}: {
  evento: Evento
  oculto?: boolean
  soloTipo?: boolean
}) {
  if (evento.tipo === null) return null
  const pedidos = soloTipo ? [] : REQUERIMIENTOS_COCINA.filter((r) => evento.requiere_cocina.includes(r))

  return (
    <span className="insignias-evento">
      <span className="pastilla-tipo" style={varsTipo(evento.tipo)}>
        <MarcaTipo tipo={evento.tipo} />
        {ETIQUETA_TIPO[evento.tipo]}
      </span>
      {pedidos.map((pedido) => (
        <span key={pedido} className="pastilla-cocina">
          <Icono nombre={ICONO[pedido]} />
          {ETIQUETA_REQUERIMIENTO[pedido]}
        </span>
      ))}
      {oculto && (
        <span className="pastilla-oculto">
          <Icono nombre="oculto" />
          Oculto por los filtros
        </span>
      )}
    </span>
  )
}
