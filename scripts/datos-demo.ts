import { crearClienteScript, exigirConfirmacion } from './cliente-script'
import { sembrarComidas } from './demo/comidas'
import { DOMINIO_DEMO, type Sembrador } from './demo/tipos'
import { asegurarUsuariosDemo } from './demo/usuarios'

/** Cada pista agrega aquí su sembrador (spec §10, índice §4). */
const SEMBRADORES: { nombre: string; sembrar: Sembrador }[] = [
  { nombre: 'comidas', sembrar: sembrarComidas },
]

async function main() {
  exigirConfirmacion('Crea cuentas y datos de desarrollo con correos @' + DOMINIO_DEMO + '.')

  const admin = crearClienteScript()
  console.log('Cuentas demo:')
  const usuarios = await asegurarUsuariosDemo(admin)

  for (const s of SEMBRADORES) {
    console.log(`Sembrando ${s.nombre}…`)
    await s.sembrar(admin, usuarios)
  }

  console.log('Listo. Contraseña: la de CONTRASENA_DEMO en .env.local')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
