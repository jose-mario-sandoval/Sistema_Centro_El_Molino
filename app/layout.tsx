import type { Metadata } from 'next'
import { IBM_Plex_Sans, Source_Serif_4 } from 'next/font/google'
import { ProveedorAvisos } from '@/components/ui/avisos'
import './globals.css'

const serif = Source_Serif_4({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--fuente-serif' })
const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--fuente-plex' })

export const metadata: Metadata = {
  title: 'Centro El Molino',
  description: 'Sistema interno del Centro El Molino',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${serif.variable} ${plex.variable}`}>
      <body>
        <ProveedorAvisos>{children}</ProveedorAvisos>
      </body>
    </html>
  )
}
