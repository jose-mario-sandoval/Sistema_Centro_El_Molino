import type { Metadata } from 'next'
import Link from 'next/link'

export const dynamic = 'force-static'

export const metadata: Metadata = { title: 'Sin conexión · Centro El Molino' }

export default function PaginaSinConexion() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#F1EDE3',
        color: '#2A251E',
      }}
    >
      <div style={{ maxWidth: 360, textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 26, margin: '0 0 8px' }}>Sin conexión</h1>
        <p style={{ fontFamily: '-apple-system, "Segoe UI", sans-serif', fontSize: 14, color: '#6E6555', margin: '0 0 20px' }}>
          No hay internet en este momento. Revisá tu conexión y volvé a intentar.
        </p>
        <Link
          href="/comidas/semana"
          prefetch={false}
          style={{
            display: 'inline-block',
            padding: '10px 16px',
            background: '#3F5D46',
            color: '#FFFFFF',
            borderRadius: 3,
            fontFamily: '-apple-system, "Segoe UI", sans-serif',
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          Reintentar
        </Link>
      </div>
    </div>
  )
}
