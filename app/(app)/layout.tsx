import { Estructura } from '@/components/app/estructura'
import { exigirPerfil } from '@/lib/auth/sesion'
import { ETIQUETA_ROL } from '@/lib/perfiles/roles'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const perfil = await exigirPerfil()

  return (
    <Estructura nombre={perfil.nombre} siglas={perfil.siglas} rol={ETIQUETA_ROL[perfil.rol]}>
      {children}
    </Estructura>
  )
}
