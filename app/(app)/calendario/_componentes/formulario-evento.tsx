'use client'

import { useActionState } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { BotonEnvio } from '@/components/ui/boton-envio'
import type { Resultado } from '@/lib/acciones/resultado'
import type { Evento } from '@/lib/calendario/tipos'
import { horaHHMM, type FechaISO } from '@/lib/fechas'
import { crearEvento, editarEvento } from '../acciones'

function ErrorCampo({ mensaje }: { mensaje?: string }) {
  return mensaje ? <div className="campo-error">{mensaje}</div> : null
}

/** Alta de un evento en el día abierto. Solo se muestra al Director. */
export function FormularioNuevoEvento({ fecha, alCerrar }: { fecha: FechaISO; alCerrar: () => void }) {
  const aviso = useAviso()
  const [estado, accion] = useActionState(
    async (previo: Resultado<{ id: string }> | null, formData: FormData): Promise<Resultado<{ id: string }> | null> => {
      const resultado = await crearEvento(previo, formData)
      if (resultado.ok) aviso('Evento agregado.')
      else if (!resultado.campos) aviso(resultado.error)
      return resultado
    },
    null,
  )
  const campos = estado && !estado.ok ? estado.campos : undefined

  return (
    <form action={accion} className="cal-evento-form">
      <div className="section-title">Nuevo evento</div>
      <input type="hidden" name="fecha" value={fecha} />
      <div className="field">
        <label htmlFor="nuevo-evento-titulo">Título del evento</label>
        <input id="nuevo-evento-titulo" name="titulo" placeholder="Ej. Charla formativa" maxLength={120} required />
        <ErrorCampo mensaje={campos?.titulo} />
      </div>
      <div className="field">
        <label htmlFor="nuevo-evento-hora">Hora (opcional)</label>
        <input id="nuevo-evento-hora" name="hora" type="time" />
        <ErrorCampo mensaje={campos?.hora ?? campos?.fecha} />
      </div>
      <div className="modal-foot">
        <button type="button" className="btn ghost" onClick={alCerrar}>
          Cerrar
        </button>
        <BotonEnvio>Agregar evento</BotonEnvio>
      </div>
    </form>
  )
}

/** Edición en línea de un evento (título, fecha y hora). Solo Director. */
export function FormularioEditarEvento({ evento, alTerminar }: { evento: Evento; alTerminar: () => void }) {
  const aviso = useAviso()
  const [estado, accion] = useActionState(
    async (previo: Resultado<null> | null, formData: FormData): Promise<Resultado<null> | null> => {
      const resultado = await editarEvento(previo, formData)
      if (resultado.ok) {
        aviso('Evento actualizado.')
        alTerminar()
      } else if (!resultado.campos) {
        aviso(resultado.error)
      }
      return resultado
    },
    null,
  )
  const campos = estado && !estado.ok ? estado.campos : undefined
  const prefijo = `evento-${evento.id}`

  return (
    <form action={accion} className="cal-evento-form editando">
      <input type="hidden" name="id" value={evento.id} />
      <div className="field">
        <label htmlFor={`${prefijo}-titulo`}>Título del evento</label>
        <input id={`${prefijo}-titulo`} name="titulo" defaultValue={evento.titulo} maxLength={120} required />
        <ErrorCampo mensaje={campos?.titulo} />
      </div>
      <div className="field">
        <label htmlFor={`${prefijo}-fecha`}>Fecha</label>
        <input id={`${prefijo}-fecha`} name="fecha" type="date" defaultValue={evento.fecha} required />
        <ErrorCampo mensaje={campos?.fecha} />
      </div>
      <div className="field">
        <label htmlFor={`${prefijo}-hora`}>Hora (opcional)</label>
        <input id={`${prefijo}-hora`} name="hora" type="time" defaultValue={evento.hora ? horaHHMM(evento.hora) : ''} />
        <ErrorCampo mensaje={campos?.hora} />
      </div>
      <div className="modal-foot">
        <button type="button" className="btn ghost small" onClick={alTerminar}>
          Cancelar
        </button>
        <BotonEnvio className="btn small">Guardar cambios</BotonEnvio>
      </div>
    </form>
  )
}
