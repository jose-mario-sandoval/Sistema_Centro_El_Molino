import type { HorasLimite } from '@/lib/comidas/tipos'
import { FormularioHorasLimite } from './formulario-horas-limite'

export function SeccionHorasLimite({ horas }: { horas: HorasLimite }) {
  return (
    <section className="settings-section" aria-labelledby="titulo-horas-limite">
      <h2 id="titulo-horas-limite">Horas límite</h2>
      <div className="desc">
        Cada comida se puede cambiar hasta su hora límite, el mismo día o el día anterior. Un cambio solo afecta a las
        comidas que todavía están abiertas: las que ya cerraron no se reabren, y si la nueva hora ya pasó, la comida se
        bloquea de inmediato.
      </div>
      <FormularioHorasLimite horas={horas} />
    </section>
  )
}
