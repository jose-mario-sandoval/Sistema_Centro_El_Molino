import { ImageResponse } from 'next/og'
import { Monograma } from '@/components/app/monograma'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(<Monograma lado={180} conMargen={false} />, size)
}
