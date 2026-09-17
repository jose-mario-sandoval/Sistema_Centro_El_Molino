export function PaginaProvisional({ titulo }: { titulo: string }) {
  return (
    <>
      <div className="page-head">
        <h1>{titulo}</h1>
        <div className="desc">Esta sección se está construyendo.</div>
      </div>
      <div className="card">
        <div className="empty-state">Próximamente.</div>
      </div>
    </>
  )
}
