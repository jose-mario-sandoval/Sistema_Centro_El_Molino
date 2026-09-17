import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Centro El Molino',
    short_name: 'El Molino',
    description: 'Sistema interno del Centro El Molino',
    lang: 'es',
    start_url: '/comidas/semana',
    scope: '/',
    display: 'standalone',
    background_color: '#F1EDE3',
    theme_color: '#3F5D46',
    icons: [
      { src: '/iconos/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/iconos/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/iconos/maskable-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
