'use client'

import { usePathname } from 'next/navigation'
import { descripcionComidas } from '@/lib/comidas/casa'
import type { Rol } from '@/lib/perfiles/roles'

/**
 * El texto bajo "Comidas". El layout no se vuelve a pintar al pasar de una pestaña a otra, así que
 * la ruta se lee acá: en La casa, el Director no está mirando "tu plan".
 */
export function DescripcionComidas({ rol }: { rol: Rol }) {
  return <div className="desc">{descripcionComidas(rol, usePathname())}</div>
}
