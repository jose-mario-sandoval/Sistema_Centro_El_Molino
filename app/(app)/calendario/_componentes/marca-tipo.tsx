import { MARCA_TIPO, type TipoEvento } from '@/lib/calendario/tipos'

/**
 * La marca del tipo: el color con la sigla (SR, SG, SM). Va por CSS (`data-marca`) y oculta al lector
 * de pantalla, que ya oye el nombre completo al lado. Junto al nombre, "Otro" es el cuadrito gris sin
 * letras (si no, se leería "Otro Otro").
 */
export function MarcaTipo({ tipo }: { tipo: TipoEvento }) {
  return <span className="marca-tipo" data-marca={tipo === 'otro' ? '' : MARCA_TIPO[tipo]} aria-hidden="true" />
}
