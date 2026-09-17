'use client'

import { useActionState, useState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import {
  ETIQUETA_TIEMPO,
  TIEMPOS_COMIDA,
  type HoraLimite,
  type HorasLimite,
  type TiempoComida,
} from '@/lib/comidas/tipos'
import { describirCierre } from '@/lib/configuraciones/horas-limite'
import { guardarHorasLimite } from '../acciones'
import { accionDeFormulario } from './llamar-accion'
import { SelectControlado } from './select-controlado'
import { useAvisoDeResultado } from './usar-aviso-resultado'

const guardarHorasLimiteSegura = accionDeFormulario(guardarHorasLimite)

export function FormularioHorasLimite({ horas }: { horas: HorasLimite }) {
  const [estado, accion] = useActionState(guardarHorasLimiteSegura, null)
  const [valores, setValores] = useState<HorasLimite>(horas)
  const campos = estado && !estado.ok ? estado.campos : undefined
  useAvisoDeResultado(estado, 'Horas límite actualizadas.')

  function cambiar(comida: TiempoComida, cambio: Partial<HoraLimite>) {
    setValores((previos) => {
      const siguientes: HorasLimite = { ...previos }
      siguientes[comida] = { ...previos[comida], ...cambio }
      return siguientes
    })
  }

  return (
    <form action={accion} noValidate>
      <div className="card">
        <div className="horas-limite-grid">
          {TIEMPOS_COMIDA.map((comida) => (
            <fieldset key={comida} className="hora-limite">
              <legend>{ETIQUETA_TIEMPO[comida]}</legend>
              <div className="field">
                <label htmlFor={`${comida}_dia`}>Día</label>
                <SelectControlado
                  id={`${comida}_dia`}
                  name={`${comida}_dia`}
                  value={String(valores[comida].diaRelativo)}
                  onChange={(e) => cambiar(comida, { diaRelativo: e.target.value === '-1' ? -1 : 0 })}
                >
                  <option value="0">Mismo día</option>
                  <option value="-1">Día anterior</option>
                </SelectControlado>
                {campos?.[`${comida}_dia`] && <div className="campo-error">{campos[`${comida}_dia`]}</div>}
              </div>
              <div className="field">
                <label htmlFor={`${comida}_hora`}>Hora</label>
                <input
                  id={`${comida}_hora`}
                  name={`${comida}_hora`}
                  type="time"
                  required
                  value={valores[comida].hora}
                  onChange={(e) => cambiar(comida, { hora: e.target.value })}
                />
                {campos?.[`${comida}_hora`] && <div className="campo-error">{campos[`${comida}_hora`]}</div>}
              </div>
              <div className="hint">Vigente: {describirCierre(horas[comida])}</div>
            </fieldset>
          ))}
        </div>
      </div>
      <div className="acciones-formulario">
        <BotonEnvio>Guardar horas límite</BotonEnvio>
      </div>
    </form>
  )
}
