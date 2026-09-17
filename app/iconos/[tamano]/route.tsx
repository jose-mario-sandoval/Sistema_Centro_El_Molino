import { ImageResponse } from 'next/og'
import { Monograma } from '@/components/app/monograma'

const TAMANOS: Record<string, { lado: number; conMargen: boolean }> = {
  '192': { lado: 192, conMargen: false },
  '512': { lado: 512, conMargen: false },
  'maskable-512': { lado: 512, conMargen: true },
}

export async function GET(_request: Request, { params }: { params: Promise<{ tamano: string }> }) {
  const { tamano } = await params
  const icono = TAMANOS[tamano]
  if (!icono) return new Response('No encontrado', { status: 404 })

  return new ImageResponse(<Monograma lado={icono.lado} conMargen={icono.conMargen} />, {
    width: icono.lado,
    height: icono.lado,
    headers: { 'Cache-Control': 'public, max-age=604800' },
  })
}
