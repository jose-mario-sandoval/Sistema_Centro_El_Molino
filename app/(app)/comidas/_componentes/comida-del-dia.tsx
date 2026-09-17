'use client'

import { useRouter } from 'next/navigation'
import { useId, useOptimistic, useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import type { Resultado } from '@/lib/acciones/resultado'
import { LARGO_MAXIMO_NOTA, mensajeNota, normalizarNota, notaValida } from '@/lib/comidas/notas'
import {
  ESTADOS_COMIDA,
  ETIQUETA_TIEMPO,
  INFO_ESTADO,
  type EstadoComida,
  type ValorComida,
  type ValorEfectivo,
} from '@/lib/comidas/tipos'
import { valorTrasGuardar, type ComidaDeSemana } from '@/lib/comidas/vista'
import type { FechaISO } from '@/lib/fechas'
import { guardarSeleccion, volverAPlan } from '../acciones'
import { estiloEstado } from './insignia-estado'

function textoOrigen(valor: ValorEfectivo): string {
  if (!valor) return 'Sin definir'
  return valor.origen === 'persona' ? 'cambiada' : 'según tu plan'
}

export function ComidaDelDia({ fecha, etiquetaDia, datos }: { fecha: FechaISO; etiquetaDia: string; datos: ComidaDeSemana }) {
  const router = useRouter()
  const aviso = useAviso()
  const idNota = useId()
  const [valor, aplicarValor] = useOptimistic(datos.valor)
  const [borrador, setBorrador] = useState<{ estado: EstadoComida; nota: string } | null>(null)
  const [pendiente, iniciar] = useTransition()

  const nombre = ETIQUETA_TIEMPO[datos.comida]
  const editable = datos.abierta
  const estadoMarcado = (editable ? borrador?.estado : undefined) ?? valor?.estado ?? null

  function ejecutar(optimista: ValorEfectivo, accion: () => Promise<Resultado<null>>) {
    iniciar(async () => {
      aplicarValor(optimista)
      const resultado = await accion()
      if (!resultado.ok) {
        // MOL01: la ventana se cerró entre que se cargó la página y se ejecutó la acción.
        // Refrescamos para traer el estado real del servidor (spec §6.4).
        aviso(resultado.error)
        setBorrador(null)
        router.refresh()
        return
      }
      setBorrador(null)
      router.refresh()
    })
  }

  function guardar(nuevo: ValorComida) {
    ejecutar(valorTrasGuardar(datos.plan, nuevo), () =>
      guardarSeleccion({ fecha, comida: datos.comida, estado: nuevo.estado, nota: nuevo.nota }),
    )
  }

  function elegir(estado: EstadoComida) {
    if (INFO_ESTADO[estado].nota) {
      setBorrador({ estado, nota: valor?.estado === estado ? (valor.nota ?? '') : '' })
      return
    }
    setBorrador(null)
    if (valor?.estado === estado) return
    guardar({ estado, nota: null })
  }

  function confirmarNota(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!borrador) return
    const nota = normalizarNota(borrador.estado, borrador.nota)
    if (!notaValida(borrador.estado, nota)) {
      aviso(mensajeNota(borrador.estado))
      return
    }
    guardar({ estado: borrador.estado, nota })
  }

  function volver() {
    ejecutar(datos.plan ? { ...datos.plan, origen: 'plan' } : null, () =>
      volverAPlan({ fecha, comida: datos.comida }),
    )
  }

  const tipoNota = borrador ? INFO_ESTADO[borrador.estado].nota : null

  return (
    <div
      className="comida-fila"
      role="group"
      aria-label={`${nombre}, ${etiquetaDia}`}
      data-fecha={fecha}
      data-comida={datos.comida}
    >
      <div className="comida-fila-top">
        <span className="comida-nombre">{nombre}</span>
        <span className="lock-note">
          <span className={valor?.origen === 'persona' ? 'origen-cambiada' : undefined}>{textoOrigen(valor)}</span>
          {' · '}
          {datos.cierre}
        </span>
      </div>

      <div className="status-row">
        {ESTADOS_COMIDA.map((estado) => {
          const marcado = estadoMarcado === estado
          return (
            <button
              key={estado}
              type="button"
              className={`status-chip${marcado ? ' selected' : ''}`}
              style={marcado ? estiloEstado(estado) : undefined}
              aria-pressed={marcado}
              disabled={!editable || pendiente}
              onClick={() => elegir(estado)}
            >
              {INFO_ESTADO[estado].etiqueta}
            </button>
          )
        })}
      </div>

      {editable && borrador ? (
        <form className="note-field editor-nota" onSubmit={confirmarNota}>
          <label htmlFor={idNota}>{tipoNota === 'hora' ? 'Hora' : 'Qué podés comer'}</label>
          <input
            id={idNota}
            type={tipoNota === 'hora' ? 'time' : 'text'}
            maxLength={tipoNota === 'texto' ? LARGO_MAXIMO_NOTA : undefined}
            value={borrador.nota}
            onChange={(e) => setBorrador({ ...borrador, nota: e.target.value })}
            required
          />
          <button type="submit" className="btn small" disabled={pendiente}>
            Guardar
          </button>
          <button type="button" className="btn ghost small" disabled={pendiente} onClick={() => setBorrador(null)}>
            Cancelar
          </button>
        </form>
      ) : (
        valor?.nota && (
          <div className="status-note">
            {INFO_ESTADO[valor.estado].nota === 'hora' ? `Hora: ${valor.nota}` : valor.nota}
          </div>
        )
      )}

      {editable && !borrador && valor?.origen === 'persona' && (
        <div className="acciones-comida">
          <button type="button" className="btn ghost small" disabled={pendiente} onClick={volver}>
            Volver a mi plan
          </button>
        </div>
      )}
    </div>
  )
}
