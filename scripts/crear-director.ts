import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'
import { crearCuenta } from '@/lib/cuentas/crear-cuenta'
import { normalizarUsuario, usuarioValido } from '@/lib/cuentas/usuario'
import { crearClienteScript } from './cliente-script'

// tsx compila como CommonJS (sin "type": "module"): no usar await de nivel superior.
async function main() {
  const { values } = parseArgs({
    options: {
      nombre: { type: 'string' },
      siglas: { type: 'string' },
      usuario: { type: 'string' },
    },
  })

  if (!values.nombre || !values.siglas || !values.usuario) {
    console.error('Uso: npm run crear-director -- --nombre "María Fernández" --siglas MF --usuario m.fernandez')
    process.exit(1)
  }

  // Con lo que va a entrar: el mismo formato que exige la base (crearCuenta avisa si ya existe).
  const usuario = normalizarUsuario(values.usuario)
  if (!usuarioValido(usuario)) {
    console.error('El usuario lleva de 3 a 30 letras sin tilde, números, punto, guion o guion bajo. Ejemplo: m.fernandez')
    process.exit(1)
  }

  const contrasena = randomBytes(9).toString('base64url')
  const resultado = await crearCuenta(crearClienteScript(), {
    nombre: values.nombre,
    siglas: values.siglas,
    usuario,
    rol: 'director',
    contrasena,
    debeCambiarContrasena: true,
  })

  if (!resultado.ok) {
    console.error(resultado.error)
    process.exit(1)
  }

  console.log(`Director creado. Usuario: ${usuario}`)
  console.log(`Contraseña temporal: ${contrasena}`)
  console.log('Al iniciar sesión se pedirá elegir una contraseña nueva.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
