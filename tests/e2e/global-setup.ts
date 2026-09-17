import { exigirBaseLocal } from '../soporte/entorno-local'
import { asegurarUsuariosPrueba } from '../soporte/usuarios-prueba'

export default async function globalSetup() {
  exigirBaseLocal()
  await asegurarUsuariosPrueba()
}
