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
    ]
  },
}

export default nextConfig
