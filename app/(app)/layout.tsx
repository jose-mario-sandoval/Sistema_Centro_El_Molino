import { Estructura } from '@/components/app/estructura'
import { SincronizarApariencia } from '@/components/ui/apariencia'
import { aparienciaDeCuenta } from '@/lib/apariencia'
import { exigirPerfil } from '@/lib/auth/sesion'
import { ETIQUETA_ROL } from '@/lib/perfiles/roles'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const perfil = await exigirPerfil()

  return (
    <>
      <SincronizarApariencia cuenta={aparienciaDeCuenta(perfil)} />
      <Estructura nombre={perfil.nombre} siglas={perfil.siglas} rol={ETIQUETA_ROL[perfil.rol]}>
        {children}
      </Estructura>
    </>
  )
}
