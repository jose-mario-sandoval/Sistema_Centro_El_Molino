import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Evita que `next dev` genere AGENTS.md/CLAUDE.md en la raíz al detectar un agente de IA:
  // serían archivos sin commitear que ensucian el repo y no forman parte del proyecto.
  agentRules: false,

  async headers() {
    return [
      {
        // Contra clickjacking: ninguna página de la app se puede mostrar dentro de un iframe.
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
      {
        // Sin caché HTTP para que las actualizaciones del service worker lleguen enseguida.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ]
  },
}

export default nextConfig
