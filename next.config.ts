import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Next.js 16 genera AGENTS.md/CLAUDE.md automáticamente al arrancar `next dev`;
  // no forman parte del repo (índice §3, mapa de archivos) y no se commitean.
  agentRules: false,
}

export default nextConfig
