import { aniosParaElegir, type MesISO } from '@/lib/calendario/cuadricula'
import type { FechaISO } from '@/lib/fechas'
import { MESES } from '@/lib/fechas/etiquetas'

/**
 * "Elegir mes y año": un formulario GET (funciona sin JavaScript) dentro de un <details>. Al enviarlo, la
 * página redirige a `/calendario?mes=AAAA-MM`, igual que las flechas. Se cierra solo al cambiar de mes
 * porque la página se vuelve a pintar desde el servidor.
 */
export function SelectorMes({ mes, hoy }: { mes: MesISO; hoy: FechaISO }) {
  const [anioActual, mesActual] = mes.split('-')
  return (
    <details className="elegir-mes">
      <summary className="btn ghost">Elegir mes y año</summary>
      <form action="/calendario" method="get" className="elegir-mes-fila">
        <div className="field">
          <label htmlFor="elegir-mes-mes">Mes</label>
          <select id="elegir-mes-mes" name="m" defaultValue={String(Number(mesActual))}>
            {MESES.map((nombre, i) => (
              <option key={nombre} value={i + 1}>
                {nombre.charAt(0).toUpperCase() + nombre.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="elegir-mes-anio">Año</label>
          <select id="elegir-mes-anio" name="anio" defaultValue={anioActual}>
            {aniosParaElegir(mes, hoy).map((anio) => (
              <option key={anio} value={anio}>
                {anio}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn">
          Ver
        </button>
      </form>
    </details>
  )
}
