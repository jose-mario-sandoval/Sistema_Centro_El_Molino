'use client'

import { startTransition, useActionState, useId, useRef, useState } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { Icono } from '@/components/ui/iconos'
import { llamarAccion } from '@/lib/acciones/llamar'
import type { Resultado } from '@/lib/acciones/resultado'
import { LARGO_MAXIMO_MENSAJE } from '@/lib/mensajes/feed'
import { publicarMensaje } from '../acciones'
import { useIdEnvio } from './use-id-envio'

/**
 * Cualquier rol elige quién lo puede leer: toda la casa, o solo Administración y el Director (algo personal,
 * como preguntar por una prenda perdida). `requiereAprobacion`: el mensaje de un Residente lo revisa primero el
 * Director, también el privado. La base vuelve a forzar la visibilidad según el rol de la sesión.
 */
export function FormularioPublicar({
  alPublicar,
  requiereAprobacion = false,
}: {
  alPublicar: (id: string, texto: string, soloDirector: boolean) => void
  requiereAprobacion?: boolean
}) {
  const aviso = useAviso()
  const idVisibilidad = useId()
  const [soloDirector, setSoloDirector] = useState(false)
  const formulario = useRef<HTMLFormElement>(null)
  const idEnvio = useIdEnvio()
  const [estado, accion, pendiente] = useActionState(
    async (previo: Resultado<{ id: string }> | null, formData: FormData) => {
      // Si la acción no llega al servidor, vuelve un fallo (no un error que tire la sección) y el formulario
      // no se reinicia (onSubmit con preventDefault, sin `action`): el texto escrito queda para reintentar.
      const resultado = await llamarAccion(() => publicarMensaje(previo, formData))
      if (resultado.ok) {
        idEnvio.confirmar(resultado.data.id)
        alPublicar(resultado.data.id, String(formData.get('texto')).trim(), formData.get('soloDirector') === 'true')
        formulario.current?.reset()
        setSoloDirector(false)
      } else if (!resultado.campos?.texto) {
        aviso(resultado.error)
      }
      return resultado
    },
    null,
  )
  const errorTexto = estado && !estado.ok ? estado.campos?.texto : undefined

  return (
    <form
      ref={formulario}
      className="compose"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const datos = new FormData(e.currentTarget)
        idEnvio.asignar(datos)
        startTransition(() => accion(datos))
      }}
    >
      <textarea
        name="texto"
        aria-label="Nuevo mensaje"
        placeholder="¿Qué querés compartir con la casa?"
        maxLength={LARGO_MAXIMO_MENSAJE}
        aria-invalid={errorTexto ? true : undefined}
      />
      {errorTexto && <div className="campo-error">{errorTexto}</div>}
      <fieldset className="grupo-campo">
        <legend>¿Quién puede leerlo?</legend>
        <div className="opciones-pastilla">
          <label className="opcion-pastilla">
            <input
              type="radio"
              name={`visibilidad-${idVisibilidad}`}
              checked={!soloDirector}
              onChange={() => setSoloDirector(false)}
            />
            <span>
              <Icono nombre="mensajes" />
              Toda la casa
            </span>
          </label>
          <label className="opcion-pastilla">
            <input
              type="radio"
              name={`visibilidad-${idVisibilidad}`}
              checked={soloDirector}
              onChange={() => setSoloDirector(true)}
            />
            <span>
              <Icono nombre="candado" />
              Solo Administración, la Administradora y el Director
            </span>
          </label>
        </div>
        <input type="hidden" name="soloDirector" value={soloDirector ? 'true' : 'false'} />
        {soloDirector && requiereAprobacion && (
          <div className="hint">Lo lee primero el Director y, si lo aprueba, Administración y la Administradora. Nadie más lo ve.</div>
        )}
      </fieldset>
      <div className="compose-foot">
        <button type="submit" className="btn" disabled={pendiente} aria-busy={pendiente}>
          {pendiente ? 'Publicando…' : 'Publicar'}
        </button>
      </div>
    </form>
  )
}
