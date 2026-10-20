'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/modal'
import { useAviso } from '@/components/ui/avisos'
import { llamarAccion } from '@/lib/acciones/llamar'
import { ZONA_HORARIA } from '@/lib/fechas'
import { CATEGORIAS_REPORTE, ETIQUETA_REPORTE, type CategoriaReporte, type ReportePension } from '@/lib/pensiones/reportes'
import { eliminarReportePension, subirReportePension } from '../acciones-reporte'

const fechaCarga = new Intl.DateTimeFormat('es-SV', {
  timeZone: ZONA_HORARIA, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

export function ReportesPensiones({ reportes, puedeSubir }: { reportes: ReportePension[]; puedeSubir: boolean }) {
  const [categoria, setCategoria] = useState<CategoriaReporte | null>(null)
  const [aEliminar, setAEliminar] = useState<ReportePension | null>(null)
  const router = useRouter()
  return <div className="pensiones-reportes">
    <p>Consultá y descargá los PDF preparados por la Administradora. Se conservan los 12 más recientes de cada categoría.</p>
    <button type="button" className="btn ghost" onClick={() => router.refresh()}>Actualizar reportes</button>
    {CATEGORIAS_REPORTE.map((tipo) => {
      const documentos = reportes.filter((reporte) => reporte.categoria === tipo)
      return <section key={tipo} className="card pensiones-reporte" aria-labelledby={`titulo-${tipo}`}>
        <div className="section-head">
          <h2 id={`titulo-${tipo}`}>{ETIQUETA_REPORTE[tipo]}</h2>
          <p>{documentos.length} de 12 documentos</p>
        </div>
        {puedeSubir && <button type="button" className="btn" onClick={() => setCategoria(tipo)}>Subir PDF · {ETIQUETA_REPORTE[tipo]}</button>}
        {documentos.length === 0 ? <p className="empty-state">Todavía no hay documentos en esta categoría.</p> : <ul className="pensiones-reporte-lista">
          {documentos.map((reporte) => <li key={reporte.id}>
            <div>
              <strong>{reporte.nombre}</strong>
              <p className="pensiones-reporte-meta">Cargado el {fechaCarga.format(new Date(reporte.cargadoEn))} · {(reporte.tamano / 1024 / 1024).toFixed(2)} MiB</p>
            </div>
            <div className="pensiones-acciones">
              <a className="btn ghost" href={`/api/pensiones/reportes/${reporte.id}`} download aria-label={`Descargar ${reporte.nombre}`}>Descargar PDF</a>
              {puedeSubir && <button type="button" className="btn danger" aria-label={`Eliminar ${reporte.nombre}`} onClick={() => setAEliminar(reporte)}>Eliminar</button>}
            </div>
          </li>)}
        </ul>}
      </section>
    })}
    {aEliminar && <EliminarReporte reporte={aEliminar} alCerrar={() => setAEliminar(null)} />}
    {categoria && <CargarReporte categoria={categoria} cantidad={reportes.filter((r) => r.categoria === categoria).length} alCerrar={() => setCategoria(null)} />}
  </div>
}

function CargarReporte({ categoria, cantidad, alCerrar }: { categoria: CategoriaReporte; cantidad: number; alCerrar: () => void }) {
  const [pendiente, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formulario = useRef<HTMLFormElement>(null)
  const archivoElegido = useRef<HTMLInputElement>(null)
  const [nombreArchivo, setNombreArchivo] = useState('Ningún archivo seleccionado.')
  const aviso = useAviso()
  const router = useRouter()
  return <Modal titulo={`Subir PDF · ${ETIQUETA_REPORTE[categoria]}`} abierto alCerrar={alCerrar} bloquearCierre={pendiente} enfocarDialogo>
    <form ref={formulario} className="pensiones-reporte-carga" noValidate onSubmit={(evento) => {
      evento.preventDefault()
      if (pendiente || !formulario.current) return
      const datos = new FormData(formulario.current)
      iniciar(async () => {
        setError(null)
        const resultado = await llamarAccion(() => subirReportePension(datos))
        if (!resultado.ok) { setError(resultado.error); return }
        aviso('Reporte guardado. Ya se puede consultar y descargar.')
        router.refresh()
        alCerrar()
      })
    }} aria-busy={pendiente}>
      <input type="hidden" name="categoria" value={categoria} />
      <div className="field">
        <label htmlFor="reporte-archivo">Documento PDF</label>
        <input ref={archivoElegido} className="sr-only" tabIndex={-1} id="reporte-archivo" name="archivo" type="file" accept="application/pdf,.pdf" required aria-describedby="reporte-ayuda" disabled={pendiente} onChange={(e) => setNombreArchivo(e.target.files?.[0]?.name ?? 'Ningún archivo seleccionado.')} />
        <button type="button" className="btn ghost" disabled={pendiente} onClick={() => archivoElegido.current?.click()}>Elegir PDF</button>
        <p role="status" className="pensiones-archivo-nombre">{nombreArchivo}</p>
        <p id="reporte-ayuda" className="hint">Hasta 3 MiB. Prepará el documento fuera del sistema y subilo aquí.</p>
      </div>
      {cantidad >= 12 && <p>Al guardar este PDF se retirará el documento más antiguo de esta categoría. Los reportes de la otra categoría se conservan.</p>}
      {error && <p className="campo-error" role="alert">{error}</p>}
      <div className="modal-foot">
        <button type="button" className="btn ghost" onClick={() => { if (!pendiente) alCerrar() }} aria-disabled={pendiente}>Cancelar</button>
        <button type="submit" className="btn" aria-disabled={pendiente}>{pendiente ? 'Subiendo PDF…' : 'Guardar PDF'}</button>
      </div>
    </form>
  </Modal>
}

/** Confirmación para quitar un reporte subido por error: se borra para siempre, no hay papelera. */
function EliminarReporte({ reporte, alCerrar }: { reporte: ReportePension; alCerrar: () => void }) {
  const [pendiente, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const aviso = useAviso()
  const router = useRouter()
  function confirmar() {
    if (pendiente) return
    setError(null)
    iniciar(async () => {
      const resultado = await llamarAccion(() => eliminarReportePension({ id: reporte.id }))
      if (!resultado.ok) { setError(resultado.error); return }
      aviso('Reporte eliminado.')
      router.refresh()
      alCerrar()
    })
  }
  return <Modal titulo="Eliminar reporte" abierto alCerrar={alCerrar} bloquearCierre={pendiente} enfocarDialogo>
    <p>¿Eliminar <strong>{reporte.nombre}</strong>?</p>
    <p className="hint">Se borra para siempre, también de {ETIQUETA_REPORTE[reporte.categoria].toLowerCase()}. Si lo subiste por error, podés volver a subir el correcto.</p>
    {error && <p className="campo-error" role="alert">{error}</p>}
    <div className="modal-foot">
      <button type="button" className="btn ghost" onClick={() => { if (!pendiente) alCerrar() }} aria-disabled={pendiente}>Cancelar</button>
      <button type="button" className="btn danger" onClick={confirmar} aria-busy={pendiente} aria-disabled={pendiente}>{pendiente ? 'Eliminando…' : 'Eliminar para siempre'}</button>
    </div>
  </Modal>
}
