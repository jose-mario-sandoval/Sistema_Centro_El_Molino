'use client'

import { useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { llamarAccion } from '@/lib/acciones/llamar'
import { ETIQUETA_TIEMPO, TIEMPOS_COMIDA, type TiempoComida } from '@/lib/comidas/tipos'
import { crearEnlaceConfirmacion, listarEnlacesDelEvento, revocarEnlaceConfirmacion } from '../acciones'

type Enlace = {
  id: string
  token: string
  tiempoComida: string
  venceEn: string
  confirmaciones: { nombre: string; cantidadPersonas: number }[]
}

export function EnlaceCenaExtra({ eventoId }: { eventoId: string }) {
  const aviso = useAviso()
  const [abierto, setAbierto] = useState(false)
  const [enlaces, setEnlaces] = useState<Enlace[] | null>(null)
  const [pendiente, iniciar] = useTransition()
  const [tiempoComida, setTiempoComida] = useState<TiempoComida>('cena')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')

  function cargar() {
    iniciar(async () => {
      const resultado = await llamarAccion(() => listarEnlacesDelEvento({ evento_id: eventoId }))
      if (resultado.ok) setEnlaces(resultado.data)
      else aviso(resultado.error)
    })
  }

  function abrir() {
    setAbierto(true)
    if (!enlaces) cargar()
  }

  function crear() {
    iniciar(async () => {
      const formData = new FormData()
      formData.set('evento_id', eventoId)
      formData.set('tiempo_comida', tiempoComida)
      formData.set('fecha_vencimiento', fecha)
      formData.set('hora_vencimiento', hora)
      const resultado = await llamarAccion(() => crearEnlaceConfirmacion(null, formData))
      if (resultado.ok) {
        aviso('Enlace generado.')
        setFecha('')
        setHora('')
        cargar()
      } else {
        aviso(resultado.error)
      }
    })
  }

  function revocar(id: string) {
    iniciar(async () => {
      const resultado = await llamarAccion(() => revocarEnlaceConfirmacion({ id }))
      if (resultado.ok) {
        aviso('Enlace revocado.')
        cargar()
      } else {
        aviso(resultado.error)
      }
    })
  }

  if (!abierto) {
    return (
      <button type="button" className="link-btn" onClick={abrir}>
        Cena extra
      </button>
    )
  }

  return (
    <div className="panel-enlaces">
      {enlaces?.map((e) => {
        const total = e.confirmaciones.reduce((suma, c) => suma + c.cantidadPersonas, 0)
        const vencido = new Date(e.venceEn) <= new Date()
        return (
          <div key={e.id} className="card enlace-item">
            <div>
              {ETIQUETA_TIEMPO[e.tiempoComida as TiempoComida]} · {vencido ? 'vencido' : `vence ${new Date(e.venceEn).toLocaleString('es-SV')}`}
            </div>
            <input readOnly value={typeof window !== 'undefined' ? `${window.location.origin}/confirmar-cena/${e.token}` : ''} />
            <div>
              {total} {total === 1 ? 'persona confirmada' : 'personas confirmadas'}
            </div>
            <ul>
              {e.confirmaciones.map((c, i) => (
                <li key={i}>
                  {c.nombre} ({c.cantidadPersonas})
                </li>
              ))}
            </ul>
            {!vencido && (
              <button type="button" className="link-btn" onClick={() => revocar(e.id)} disabled={pendiente}>
                Revocar ahora
              </button>
            )}
          </div>
        )
      })}

      <div className="field">
        <label htmlFor={`${eventoId}-tiempo`}>Tiempo de comida</label>
        <select id={`${eventoId}-tiempo`} value={tiempoComida} onChange={(e) => setTiempoComida(e.target.value as TiempoComida)}>
          {TIEMPOS_COMIDA.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIEMPO[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${eventoId}-fecha`}>Vence el</label>
        <input id={`${eventoId}-fecha`} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>
      <div className="field">
        {/* "Hora de vencimiento", no "Hora" a secas: getByLabel hace substring match y el formulario
            de alta de evento en el mismo modal ya tiene un campo "Hora (opcional)" — con "Hora" sola,
            el e2e (y cualquier lector de pantalla que dependa del label) no podría distinguirlos. */}
        <label htmlFor={`${eventoId}-hora`}>Hora de vencimiento</label>
        <input id={`${eventoId}-hora`} type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
      </div>
      <button type="button" className="btn small" onClick={crear} disabled={pendiente || !fecha || !hora}>
        Generar enlace
      </button>
      <button type="button" className="btn ghost small" onClick={() => setAbierto(false)}>
        Cerrar
      </button>
    </div>
  )
}
