import { Icono } from '@/components/ui/iconos'
import { partesParaCocina, totalQueComen, type ParteResumen, type ResumenComida } from '@/lib/comidas/resumen'
import { varsEstado } from './insignia-estado'

/**
 * Lo que la cocina necesita de una comida: cuántos comen y cómo (temprano y a qué hora, tarde, en
 * bolsa, enfermo y qué puede comer…), sin nombres. Sin hooks ni 'use client', para poder usarse también dentro de una tabla
 * de cliente. `como='spans'` es para ir dentro de un <button>, que no admite listas.
 */
export function CeldaResumen({
  resumen,
  extra,
  notas,
  como = 'lista',
}: {
  resumen: ResumenComida
  /** Personas extra de la comida (cenas extra confirmadas): no están en `resumen`. */
  extra?: number
  /** Notas para la cocina sobre los extras. Nunca nombres. */
  notas?: readonly string[]
  como?: 'lista' | 'spans'
}) {
  const comen = totalQueComen(resumen)
  const partes = partesParaCocina(resumen)
  const Lista = como === 'lista' ? 'ul' : 'span'
  const Item = como === 'lista' ? 'li' : 'span'

  return (
    <>
      <span className="conteo-celda">
        <span className="conteo-numero">{comen}</span>{' '}
        <span className="conteo-etiqueta">{comen === 1 ? 'come' : 'comen'}</span>
      </span>
      {partes.length > 0 && (
        <Lista className="partes">
          {partes.map((parte) => (
            <Parte key={parte.clave} parte={parte} Item={Item} />
          ))}
        </Lista>
      )}
      {extra ? <span className="status-note conteo-extra">{`+${extra} extra`}</span> : null}
      {notas && notas.length > 0 && (
        <Lista className="notas-extra">
          {notas.map((nota, indice) => (
            <Item key={indice}>{nota}</Item>
          ))}
        </Lista>
      )}
    </>
  )
}

/** Icono + texto + color: el color nunca va solo (DESIGN.md §2.3). */
function Parte({ parte, Item }: { parte: ParteResumen; Item: 'li' | 'span' }) {
  if (parte.clave === 'sin_definir')
    return (
      <Item className="parte sin-definir">
        <Icono nombre="sinDefinir" />
        {parte.texto}
      </Item>
    )
  return (
    <>
      <Item className="parte" style={varsEstado(parte.clave)}>
        <Icono nombre={parte.clave} />
        {parte.texto}
      </Item>
      {/* Texto libre de cada persona (enfermo: qué puede comer). Sin nombre; el renglón parte, no se recorta. */}
      {parte.notas?.map((nota, indice) => (
        <Item key={indice} className="nota-parte">
          {nota}
        </Item>
      ))}
    </>
  )
}
