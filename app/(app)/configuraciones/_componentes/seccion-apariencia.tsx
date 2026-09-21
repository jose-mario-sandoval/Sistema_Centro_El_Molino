import { OpcionesApariencia } from '@/components/ui/apariencia'

/** Primera sección de Ajustes: es lo que alguien con poca vista necesita antes que nada. */
export function SeccionApariencia() {
  return (
    <section className="settings-section" aria-labelledby="titulo-apariencia">
      <h2 id="titulo-apariencia">Apariencia</h2>
      <div className="desc">Cómo se ve la aplicación en este dispositivo. Los cambios se aplican al instante.</div>
      <div className="card">
        <OpcionesApariencia />
      </div>
    </section>
  )
}
