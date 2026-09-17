import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans, Source_Serif_4 } from 'next/font/google'
import { RegistrarServiceWorker } from '@/components/app/registrar-sw'
import { ProveedorAvisos } from '@/components/ui/avisos'
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
    <html lang="es" className={`${serif.variable} ${plex.variable}`}>
      <body>
        <RegistrarServiceWorker />
        <ProveedorAvisos>{children}</ProveedorAvisos>
      </body>
    </html>
  )
}
