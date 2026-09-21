import { Icono, type NombreIcono } from '@/components/ui/iconos'
import { ETIQUETA_REQUERIMIENTO, ETIQUETA_TIPO, REQUERIMIENTOS_COCINA, type Evento, type RequerimientoCocina } from '@/lib/calendario/tipos'

/** 'comida' usa el icono del plato, que ya existe en la navegación. */
const ICONO: Record<RequerimientoCocina, NombreIcono> = { merienda: 'merienda', comida: 'comidas', materiales: 'materiales' }

/**
 * De qué tipo es el evento y qué le pide a la cocina. Administración no conoce el tipo (llega null):
 * a ella su título ya es el resumen de lo que debe preparar, así que aquí no se repite.
 */
export function InsigniasEvento({ evento }: { evento: Evento }) {
  if (evento.tipo === null) return null
  const conTipo = evento.tipo !== 'otro'
  const pedidos = REQUERIMIENTOS_COCINA.filter((r) => evento.requiere_cocina.includes(r))
  if (!conTipo && pedidos.length === 0) return null

  return (
    <span className="insignias-evento">
      {conTipo && <span className="pastilla-tipo">{ETIQUETA_TIPO[evento.tipo]}</span>}
      {pedidos.map((pedido) => (
        <span key={pedido} className="pastilla-cocina">
          <Icono nombre={ICONO[pedido]} />
          {ETIQUETA_REQUERIMIENTO[pedido]}
        </span>
      ))}
    </span>
  )
}
