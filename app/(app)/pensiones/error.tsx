'use client'

export default function ErrorPensiones({ reset }: { reset: () => void }) {
  return <div className="card" role="alert"><h2 className="section-title">No se pudieron cargar las pensiones</h2><p>Revisá tu conexión e intentá de nuevo.</p><button className="btn" onClick={reset}>Volver a intentar</button></div>
}
