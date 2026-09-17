import { crearClienteScript, exigirConfirmacion } from './cliente-script'
import { DOMINIO_DEMO } from './demo/tipos'

async function main() {
  exigirConfirmacion(`Borra todas las cuentas @${DOMINIO_DEMO} y, en cascada, todo lo que crearon.`)

  const admin = crearClienteScript()
  const { data: perfiles, error } = await admin.from('perfiles').select('id, correo').like('correo', `%@${DOMINIO_DEMO}`)
  if (error) throw error

  for (const p of perfiles) {
    const { error: errorBorrado } = await admin.auth.admin.deleteUser(p.id)
    if (errorBorrado) {
      console.error(`No se pudo borrar ${p.correo}: ${errorBorrado.message}`)
      process.exitCode = 1
    } else {
      console.log(`Borrada: ${p.correo}`)
    }
  }

  console.log(`Cuentas demo borradas: ${perfiles.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
