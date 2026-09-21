import { OpcionesApariencia } from '@/components/ui/apariencia'

/** Primera sección de Ajustes: es lo que alguien con poca vista necesita antes que nada. */
export function SeccionApariencia() {
  return (
    <section className="settings-section" aria-labelledby="titulo-apariencia">
      <h2 id="titulo-apariencia">Apariencia</h2>
      <div className="desc">
        Cómo se ve la aplicación. Se guarda en tu cuenta, así que te acompaña en tus otros dispositivos. Los cambios se
        aplican al instante.
      </div>
      <div className="card">
        <OpcionesApariencia guardarEnCuenta />
      </div>
    </section>
  )
}
