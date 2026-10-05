import { crearClienteScript, exigirConfirmacion } from './cliente-script'
import { PREFIJO_DEMO } from './demo/tipos'

async function main() {
  exigirConfirmacion(`Borra todas las cuentas de usuario ${PREFIJO_DEMO}… y, en cascada, todo lo que crearon.`)

  const admin = crearClienteScript()
  // `\\.`: en LIKE el punto es literal, pero `_` y `%` no; el prefijo no lleva ninguno de los dos.
  const { data: perfiles, error } = await admin.from('perfiles').select('id, usuario').like('usuario', `${PREFIJO_DEMO}%`)
  if (error) throw error

  for (const p of perfiles) {
    const { error: errorBorrado } = await admin.auth.admin.deleteUser(p.id)
    if (errorBorrado) {
      console.error(`No se pudo borrar ${p.usuario}: ${errorBorrado.message}`)
      process.exitCode = 1
    } else {
      console.log(`Borrada: ${p.usuario}`)
    }
  }

  console.log(`Cuentas demo borradas: ${perfiles.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
