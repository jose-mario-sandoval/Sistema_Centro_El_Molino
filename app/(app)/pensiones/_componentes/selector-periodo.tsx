import { MESES } from '@/lib/fechas/etiquetas'

export function SelectorPeriodo({ ruta, anio, mes, vista }: { ruta: string; anio: number; mes?: number; vista?: string }) {
  return <form action={ruta} className="pensiones-selector">
    {vista !== undefined && <input type="hidden" name="vista" value={vista} />}
    {mes !== undefined && <div className="field"><label htmlFor="pension-mes">Mes</label><select id="pension-mes" name="mes" defaultValue={mes}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>}
    <div className="field"><label htmlFor="pension-anio">Año</label><input id="pension-anio" name="anio" type="number" min="2000" max="2200" required defaultValue={anio} /></div>
    <button className="btn" type="submit">Consultar</button>
  </form>
}
