import { headers } from 'next/headers'
import { Estructura } from '@/components/app/estructura'
import { InvitacionInstalar, OfrecerAvisos } from '@/components/app/invitaciones'
import { ProveedorPendientes } from '@/components/app/pendientes'
import { SincronizarApariencia } from '@/components/ui/apariencia'
import { aparienciaDeCuenta } from '@/lib/apariencia'
import { exigirPerfil } from '@/lib/auth/sesion'
import { contarMensajesPendientes } from '@/lib/mensajes/consultas'
import { ETIQUETA_ROL, type Rol } from '@/lib/perfiles/roles'
import { nombreAparato, puedeSerMovil } from '@/lib/pwa/instalar'
import { textoOfrecerAvisos } from '@/lib/push/preferencias'

/** Globito de pendientes: solo el Director modera. Un error no tira la app entera: sin globito hasta recontar. */
async function pendientesPara(rol: Rol): Promise<number | null> {
  if (rol !== 'director') return null
  try {
    return await contarMensajesPendientes()
  } catch (error) {
    console.error('contarMensajesPendientes', error)
    return 0
  }
}

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const perfil = await exigirPerfil()
  const pendientes = await pendientesPara(perfil.rol)
  // Las invitaciones (instalar, activar los avisos) solo se pintan si puede ser un teléfono o tablet;
  // el script de <head> decide si se ven (app/layout.tsx, lib/pwa/instalar.ts).
  const userAgent = (await headers()).get('user-agent')
  const movil = puedeSerMovil(userAgent)
  const enEste = nombreAparato(userAgent)

  return (
    <>
      <SincronizarApariencia cuenta={aparienciaDeCuenta(perfil)} />
      <ProveedorPendientes inicial={pendientes}>
        <Estructura nombre={perfil.nombre} siglas={perfil.siglas} rol={ETIQUETA_ROL[perfil.rol]}>
          {movil && <InvitacionInstalar enEste={enEste} />}
          {movil && <OfrecerAvisos enEste={enEste} texto={textoOfrecerAvisos(perfil.rol)} />}
          {children}
        </Estructura>
      </ProveedorPendientes>
    </>
  )
}
