'use client'

import { useId, useOptimistic, useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { fallo, type Resultado } from '@/lib/acciones/resultado'
import { LARGO_MAXIMO_NOTA, mensajeNota, normalizarNota, notaValida } from '@/lib/comidas/notas'
import { VALOR_POR_AUSENCIA } from '@/lib/comidas/reglas'
import {
  ETIQUETA_TIEMPO,
  INFO_ESTADO,
  type EstadoComida,
  type TiempoComida,
  type ValorComida,
  type ValorEfectivo,
} from '@/lib/comidas/tipos'
import { valorTrasGuardar, type ComidaDeSemana } from '@/lib/comidas/vista'
import type { FechaISO } from '@/lib/fechas'
import { guardarSeleccion, volverAPlan } from '../acciones'
import { textoNota } from './insignia-estado'
import { SelectorComida } from './selector-comida'

const VERBO: Record<TiempoComida, string> = { desayuno: 'desayunar', almuerzo: 'almorzar', cena: 'cenar' }

/** 'cierra hoy 10:00' → 'Cierra hoy 10:00' */
function conMayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function ComidaDelDia({
  fecha,
  dia,
  etiquetaDia,
  datos,
}: {
  fecha: FechaISO
  /** 'Miércoles' */
  dia: string
  /** 'Miércoles 23/9' */
  etiquetaDia: string
  datos: ComidaDeSemana
}) {
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
      let resultado: Resultado<null>
      try {
        resultado = await accion()
      } catch {
        // Sin conexión o error inesperado: aviso y se revierte, sin pasar a la pantalla de error (spec §9.1).
        resultado = fallo('No se pudo guardar. Revisá tu conexión e intentá de nuevo.')
      }
      // No hace falta router.refresh(): la acción revalida /comidas al guardar y también ante MOL01
      // (la ventana cerró mientras la página estaba abierta), y su respuesta ya trae la vista real
      // (spec §6.4). Al terminar la transición, el valor optimista se reemplaza por ese estado.
      if (!resultado.ok) aviso(resultado.error)
      setBorrador(null)
    })
  }

  function guardar(nuevo: ValorComida) {
    ejecutar(valorTrasGuardar(datos.plan, nuevo, datos.ausente), () =>
      guardarSeleccion({ fecha, comida: datos.comida, estado: nuevo.estado, nota: nuevo.nota }),
    )
  }

  function elegir(estado: EstadoComida) {
    // Mientras se guarda, los chips siguen enfocables (aria-disabled) pero ignoran los clics.
    if (pendiente) return
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
    // Volver a la referencia: si está ausente ese día, "No comer" por la ausencia; si no, su plan.
    ejecutar(datos.ausente ? VALOR_POR_AUSENCIA : datos.plan ? { ...datos.plan, origen: 'plan' } : null, () =>
      volverAPlan({ fecha, comida: datos.comida }),
    )
  }

  const tipoNota = borrador ? INFO_ESTADO[borrador.estado].nota : null
  const escribiendoNota = editable && borrador !== null

  return (
    <div
      className="comida-fila"
      role="group"
      aria-label={`${nombre}, ${etiquetaDia}`}
      data-fecha={fecha}
      data-comida={datos.comida}
    >
      <SelectorComida
        nombre={nombre}
        estado={valor?.estado ?? null}
        marcado={estadoMarcado}
        pregunta={`¿Vas a ${VERBO[datos.comida]} el ${dia.toLowerCase()}?`}
        origen={valor ? { texto: textoOrigen(valor), cambiada: valor.origen === 'persona' } : null}
        nota={!escribiendoNota && valor?.nota ? textoNota(valor.estado, valor.nota) : null}
        cierre={editable ? conMayuscula(datos.cierre) : null}
        cerrada={editable ? null : 'Cerrada: ya no se puede cambiar.'}
        pendiente={pendiente}
        editorAbierto={escribiendoNota}
        alElegir={elegir}
        alCerrar={() => setBorrador(null)}
        editorNota={
          escribiendoNota && (
            <form className="note-field editor-nota" onSubmit={confirmarNota}>
              <label htmlFor={idNota}>{tipoNota === 'hora' ? 'Hora' : 'Qué podés comer'}</label>
              <input
                id={idNota}
                type={tipoNota === 'hora' ? 'time' : 'text'}
                maxLength={tipoNota === 'texto' ? LARGO_MAXIMO_NOTA : undefined}
                value={borrador.nota}
                onChange={(e) => setBorrador({ ...borrador, nota: e.target.value })}
                required
                // La persona acaba de elegir un estado que pide nota: el teclado es lo esperado.
                autoFocus
              />
              <div className="acciones-formulario">
                <button type="submit" className="btn" disabled={pendiente}>
                  Guardar
                </button>
                <button type="button" className="btn ghost" disabled={pendiente} onClick={() => setBorrador(null)}>
                  Cancelar
                </button>
              </div>
            </form>
          )
        }
        acciones={
          !escribiendoNota &&
          valor?.origen === 'persona' && (
            <button type="button" className="btn ghost" disabled={pendiente} onClick={volver}>
              {datos.ausente ? 'Volver a mi ausencia' : 'Volver a mi plan'}
            </button>
          )
        }
      />
    </div>
  )
}

function textoOrigen(valor: NonNullable<ValorEfectivo>): string {
  if (valor.origen === 'persona') return 'cambiada'
  return valor.origen === 'ausencia' ? 'por tu ausencia' : 'según tu plan'
}
