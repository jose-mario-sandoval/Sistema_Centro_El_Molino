import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'
import { crearCuenta } from '@/lib/cuentas/crear-cuenta'
import { crearClienteScript } from './cliente-script'

// tsx compila como CommonJS (sin "type": "module"): no usar await de nivel superior.
async function main() {
  const { values } = parseArgs({
    options: {
      nombre: { type: 'string' },
      siglas: { type: 'string' },
      correo: { type: 'string' },
    },
  })

  if (!values.nombre || !values.siglas || !values.correo) {
    console.error('Uso: npm run crear-director -- --nombre "María Fernández" --siglas MF --correo maria@centro.org')
    process.exit(1)
  }

  const contrasena = randomBytes(9).toString('base64url')
  const resultado = await crearCuenta(crearClienteScript(), {
    nombre: values.nombre,
    siglas: values.siglas,
    correo: values.correo,
    rol: 'director',
    contrasena,
    debeCambiarContrasena: true,
  })

  if (!resultado.ok) {
    console.error(resultado.error)
    process.exit(1)
  }

  console.log(`Director creado: ${values.correo.toLowerCase()}`)
  console.log(`Contraseña temporal: ${contrasena}`)
  console.log('Al iniciar sesión se pedirá elegir una contraseña nueva.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
