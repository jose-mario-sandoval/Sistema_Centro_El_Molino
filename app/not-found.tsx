import Link from 'next/link'

/** Página no encontrada global (spec §9.1). Sin datos de sesión: el proxy ya exige iniciar sesión. */
export default function NoEncontrada() {
  return (
    <main className="content" style={{ margin: '0 auto' }}>
      <div className="page-head">
        <h1>Página no encontrada</h1>
        <div className="desc">La dirección no existe o ya no está disponible.</div>
      </div>
      <div className="card">
        <div className="empty-state">
          <p style={{ marginBottom: 16 }}>Revisá el enlace o volvé al inicio.</p>
          <Link href="/comidas/semana" className="btn" style={{ textDecoration: 'none' }}>
            Ir a Comidas
          </Link>
        </div>
      </div>
    </main>
  )
}
