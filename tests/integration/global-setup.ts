import { exigirBaseLocal } from '../soporte/entorno-local'
import { asegurarUsuariosPrueba } from '../soporte/usuarios-prueba'

export default async function setup() {
  exigirBaseLocal()
  await asegurarUsuariosPrueba()
}
