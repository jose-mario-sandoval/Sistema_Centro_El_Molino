'use client'

import { useActionState, useState } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { fallo, type Resultado } from '@/lib/acciones/resultado'
import { FECHA_MAXIMA, FECHA_MINIMA } from '@/lib/calendario/cuadricula'
import type { Evento, RequerimientoCocina, TipoEvento } from '@/lib/calendario/tipos'
import { horaHHMM, type FechaISO } from '@/lib/fechas'
import { crearEvento, editarEvento } from '../acciones'
import { CamposTipoYCocina } from './campos-evento'

const CAMPOS_VISIBLES = ['titulo', 'fecha', 'hora', 'tipo', 'requiere_cocina', 'requiere_otro_texto'] as const

function ErrorCampo({ mensaje }: { mensaje?: string }) {
  return mensaje ? <div className="campo-error">{mensaje}</div> : null
}

/**
 * Aviso para los errores que el formulario no muestra junto a un campo:
 * errores generales (sin campos) o un error de `id` sin otro campo inválido.
 */
function mensajeSinCampoVisible(resultado: { error: string; campos?: Record<string, string> }): string | null {
  const { campos } = resultado
  if (!campos) return resultado.error
  if (CAMPOS_VISIBLES.some((campo) => campos[campo])) return null
  return campos.id ?? resultado.error
}

/** Alta de un evento en el día abierto. Solo se muestra al Director. */
export function FormularioNuevoEvento({ fecha, alCerrar }: { fecha: FechaISO; alCerrar: () => void }) {
  const aviso = useAviso()
  // Controlados: React 19 reinicia los campos no controlados al terminar la acción,
  // y tras un error el Director perdería lo que escribió (mismo patrón que el login).
  const [titulo, setTitulo] = useState('')
  const [hora, setHora] = useState('')
  // Sin tipo elegido de entrada: es un dato que el Director tiene que decidir, no uno que se hereda.
  const [tipo, setTipo] = useState<TipoEvento | ''>('')
  const [requiere, setRequiere] = useState<RequerimientoCocina[]>([])
  const [otroTexto, setOtroTexto] = useState('')
  const [estado, accion] = useActionState(
    async (previo: Resultado<{ id: string }> | null, formData: FormData): Promise<Resultado<{ id: string }> | null> => {
      let resultado: Resultado<{ id: string }>
      try {
        resultado = await crearEvento(previo, formData)
      } catch {
        resultado = fallo('No se pudo guardar el evento. Revisá tu conexión e intentá de nuevo.')
      }
      if (resultado.ok) {
        aviso('Evento agregado.')
        setTitulo('')
        setHora('')
        setTipo('')
        setRequiere([])
        setOtroTexto('')
      } else {
        const mensaje = mensajeSinCampoVisible(resultado)
        if (mensaje) aviso(mensaje)
      }
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
        <input
          id="nuevo-evento-titulo"
          name="titulo"
          placeholder="Ej. Charla formativa"
          maxLength={120}
          required
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
        />
        <ErrorCampo mensaje={campos?.titulo} />
      </div>
      <CamposTipoYCocina
        tipo={tipo}
        alCambiarTipo={setTipo}
        requiere={requiere}
        alCambiarRequiere={setRequiere}
        otroTexto={otroTexto}
        alCambiarOtroTexto={setOtroTexto}
        errorTipo={campos?.tipo}
        errorCocina={campos?.requiere_cocina}
        errorOtroTexto={campos?.requiere_otro_texto}
      />
      <div className="field">
        <label htmlFor="nuevo-evento-hora">Hora (opcional)</label>
        <input id="nuevo-evento-hora" name="hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
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

/**
 * Edición en línea de un evento (título, fecha y hora). Solo Director.
 * `alTerminar` se llama al cancelar y al guardar con éxito.
 */
export function FormularioEditarEvento({ evento, alTerminar }: { evento: Evento; alTerminar: () => void }) {
  const aviso = useAviso()
  // Controlados por la misma razón que en el alta: si guardar falla, quedan los valores escritos, no los originales.
  const [titulo, setTitulo] = useState(evento.titulo)
  const [fecha, setFecha] = useState(evento.fecha)
  const [hora, setHora] = useState(evento.hora ? horaHHMM(evento.hora) : '')
  const [tipo, setTipo] = useState<TipoEvento | ''>(evento.tipo ?? '')
  const [requiere, setRequiere] = useState<RequerimientoCocina[]>(evento.requiere_cocina)
  const [otroTexto, setOtroTexto] = useState(evento.requiere_otro_texto ?? '')
  const [estado, accion] = useActionState(
    async (previo: Resultado<null> | null, formData: FormData): Promise<Resultado<null> | null> => {
      let resultado: Resultado<null>
      try {
        resultado = await editarEvento(previo, formData)
      } catch {
        resultado = fallo('No se pudo guardar el evento. Revisá tu conexión e intentá de nuevo.')
      }
      if (resultado.ok) {
        aviso('Evento actualizado.')
        alTerminar()
      } else {
        const mensaje = mensajeSinCampoVisible(resultado)
        if (mensaje) aviso(mensaje)
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
        <input
          id={`${prefijo}-titulo`}
          name="titulo"
          maxLength={120}
          required
          // Al entrar en modo edición el foco va al primer campo.
          autoFocus
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
        />
        <ErrorCampo mensaje={campos?.titulo} />
      </div>
      <CamposTipoYCocina
        tipo={tipo}
        alCambiarTipo={setTipo}
        requiere={requiere}
        alCambiarRequiere={setRequiere}
        otroTexto={otroTexto}
        alCambiarOtroTexto={setOtroTexto}
        errorTipo={campos?.tipo}
        errorCocina={campos?.requiere_cocina}
        errorOtroTexto={campos?.requiere_otro_texto}
      />
      <div className="field">
        <label htmlFor={`${prefijo}-fecha`}>Fecha</label>
        <input
          id={`${prefijo}-fecha`}
          name="fecha"
          type="date"
          min={FECHA_MINIMA}
          max={FECHA_MAXIMA}
          required
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
        <ErrorCampo mensaje={campos?.fecha} />
      </div>
      <div className="field">
        <label htmlFor={`${prefijo}-hora`}>Hora (opcional)</label>
        <input id={`${prefijo}-hora`} name="hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
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
