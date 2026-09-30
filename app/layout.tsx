import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans, Source_Serif_4 } from 'next/font/google'
import { RegistrarServiceWorker } from '@/components/app/registrar-sw'
import { ProveedorAvisos } from '@/components/ui/avisos'
import { SCRIPT_APARIENCIA } from '@/lib/apariencia'
import { SCRIPT_FILTROS_CALENDARIO } from '@/lib/calendario/filtros'
import './globals.css'

const serif = Source_Serif_4({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--fuente-serif' })
const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--fuente-plex' })

export const metadata: Metadata = {
  title: 'Centro El Molino',
  description: 'Sistema interno del Centro El Molino',
  // Pista 06: instalación como app
  applicationName: 'Centro El Molino',
  appleWebApp: { capable: true, title: 'El Molino', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
}

// Pista 06: color de la barra del sistema en la app instalada
export const viewport: Viewport = {
  themeColor: '#3F5D46',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: los scripts de <head> ponen data-theme/data-contraste/data-texto (y
    // data-cal-oculta) antes de que React hidrate, así que no coinciden con el HTML del servidor a propósito.
    <html lang="es" className={`${serif.variable} ${plex.variable}`} suppressHydrationWarning>
      <head>
        {/* Antes de pintar: la letra y el contraste de cada persona desde el primer instante (DESIGN.md §5). */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_APARIENCIA }} />
        {/* Lo que la persona ocultó del calendario, para que al recargar no aparezca un instante (lib/calendario/filtros.ts). */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_FILTROS_CALENDARIO }} />
      </head>
      <body>
        <RegistrarServiceWorker />
        <ProveedorAvisos>{children}</ProveedorAvisos>
      </body>
    </html>
  )
}
