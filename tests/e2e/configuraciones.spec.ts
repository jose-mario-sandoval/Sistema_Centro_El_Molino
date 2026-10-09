import { expect, test, type Page } from '@playwright/test'
import { HORAS_LIMITE_POR_DEFECTO } from '../../lib/comidas/tipos'
import { direccionInterna, esDireccionInterna } from '../../lib/cuentas/usuario'
import {
  asegurarUsuariosPrueba,
  clienteAdminPrueba,
  CONTRASENA_PRUEBA,
  USUARIOS_PRUEBA,
  type ClaveUsuario,
} from '../soporte/usuarios-prueba'

const USUARIO_CUENTA_NUEVA = 'cuenta.nueva'
const USUARIO_DESECHABLE = 'cuenta.desechable'
const USUARIO_DESECHABLE_NUEVO = 'cuenta.cambiada'
const USUARIO_ADMIN_NUEVO = 'admin.e2e'
const FORMATO_TEMPORAL = /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/

async function iniciarSesion(page: Page, usuario: string, contrasena: string = CONTRASENA_PRUEBA) {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(usuario)
  await page.getByLabel('Contraseña').fill(contrasena)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
}

async function abrirConfiguracionesComo(page: Page, clave: ClaveUsuario) {
  await iniciarSesion(page, USUARIOS_PRUEBA[clave].usuario)
  await expect(page).toHaveURL(/\/comidas\/semana$/)
  await page.goto('/configuraciones')
  await expect(page.getByRole('heading', { name: 'Ajustes', level: 1 })).toBeVisible()
}

/**
 * Borra las cuentas con esos usuarios y, además, los usuarios de Auth con dirección interna que
 * quedaron sin perfil (pruebas cortadas a mitad): las cuentas de prueba fijas no usan esas direcciones.
 */
async function borrarCuentas(usuarios: string[]) {
  const admin = clienteAdminPrueba()
  const ids = new Set<string>()

  const { data: perfiles, error } = await admin.from('perfiles').select('id').in('usuario', usuarios)
  if (error) throw error
  for (const { id } of perfiles) ids.add(id)

  const { data: conPerfil, error: errorPerfiles } = await admin.from('perfiles').select('id')
  if (errorPerfiles) throw errorPerfiles
  const idsConPerfil = new Set(conPerfil.map(({ id }) => id))
  const { data: deAuth, error: errorUsuarios } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (errorUsuarios) throw errorUsuarios
  for (const cuenta of deAuth.users) {
    if (esDireccionInterna(cuenta.email) && !idsConPerfil.has(cuenta.id)) ids.add(cuenta.id)
  }

  // Borrar el usuario de Auth borra su perfil (on delete cascade).
  for (const id of ids) {
    const { error: errorBorrado } = await admin.auth.admin.deleteUser(id)
    if (errorBorrado) throw errorBorrado
  }
}

/** Cuenta propia de una sola prueba, lista para entrar (sin cambio de contraseña pendiente). */
async function crearCuentaDesechable(usuario: string) {
  const admin = clienteAdminPrueba()
  const { data, error } = await admin.auth.admin.createUser({
    email: direccionInterna(),
    password: CONTRASENA_PRUEBA,
    email_confirm: true,
  })
  if (error) throw error
  const { error: errorPerfil } = await admin.from('perfiles').insert({
    id: data.user.id,
    nombre: 'Cuenta Desechable',
    siglas: 'CD',
    usuario,
    rol: 'residente',
    debe_cambiar_contrasena: false,
  })
  if (errorPerfil) throw errorPerfil
}

async function restaurarHorasLimite() {
  const admin = clienteAdminPrueba()
  for (const [comida, { diaRelativo, hora }] of Object.entries(HORAS_LIMITE_POR_DEFECTO)) {
    const { error } = await admin.from('horas_limite').update({ dia_relativo: diaRelativo, hora }).eq('comida', comida)
    if (error) throw error
  }
}

// Corre también si la prueba falla: un reintento de CI empieza limpio.
test.afterEach(async () => {
  await borrarCuentas([USUARIO_CUENTA_NUEVA, USUARIO_DESECHABLE, USUARIO_DESECHABLE_NUEVO, USUARIO_ADMIN_NUEVO])
  await restaurarHorasLimite()
  await asegurarUsuariosPrueba()
})

test('un residente ve Mi cuenta pero no Horas límite ni Gestión de usuarios', async ({ page }) => {
  await abrirConfiguracionesComo(page, 'residente')
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Horas límite' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Gestión de usuarios' })).toHaveCount(0)
  await expect(page.getByLabel('Rol', { exact: true })).toBeDisabled()
  // Ve su usuario, pero no lo cambia: es del Director.
  const usuario = page.getByLabel('Usuario', { exact: true })
  await expect(usuario).toHaveValue(USUARIOS_PRUEBA.residente.usuario)
  await expect(usuario).toHaveAttribute('readonly', '')
  await expect(page.getByLabel('Correo')).toHaveCount(0)
})

test('un residente cambia su nombre y lo ve en la barra lateral', async ({ page }) => {
  await abrirConfiguracionesComo(page, 'residente')
  await page.getByLabel('Nombre', { exact: true }).fill('Residente Renombrado')
  await page.getByLabel('Siglas', { exact: true }).fill('rr')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Cuenta actualizada.')).toBeVisible()
  // El formulario muestra los valores tal como quedaron guardados.
  await expect(page.getByLabel('Siglas', { exact: true })).toHaveValue('RR')
  await expect(page.locator('.sidebar')).toContainText('Residente Renombrado')
  await expect(page.locator('.sidebar .avatar')).toHaveText('RR')
})

test('la apariencia se guarda en la cuenta y llega a un dispositivo nuevo', async ({ page, browser, baseURL }) => {
  const { usuario } = USUARIOS_PRUEBA.residente
  await abrirConfiguracionesComo(page, 'residente')

  await page.getByRole('button', { name: 'Muy grande', exact: true }).click()
  await page.getByRole('button', { name: 'Alto', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-texto', 'enorme')
  await expect(page.locator('html')).toHaveAttribute('data-contraste', 'alto')

  // Quedó guardada en la cuenta, no solo en este dispositivo.
  await expect
    .poll(async () => {
      const { data } = await clienteAdminPrueba()
        .from('perfiles')
        .select('apariencia_texto, apariencia_contraste, apariencia_tema')
        .eq('usuario', usuario)
        .single()
      return data
    })
    .toEqual({ apariencia_texto: 'enorme', apariencia_contraste: 'alto', apariencia_tema: null })

  // Un dispositivo nuevo (contexto sin nada guardado) la recibe al iniciar sesión.
  const dispositivoNuevo = await browser.newContext({ baseURL })
  try {
    const otra = await dispositivoNuevo.newPage()
    await iniciarSesion(otra, usuario)
    await expect(otra).toHaveURL(/\/comidas\/semana$/)
    await expect(otra.locator('html')).toHaveAttribute('data-texto', 'enorme')
    await expect(otra.locator('html')).toHaveAttribute('data-contraste', 'alto')
  } finally {
    await dispositivoNuevo.close()
  }
})

test('el Director cambia el usuario de una cuenta y la persona entra solo con el nuevo', async ({ page }) => {
  await crearCuentaDesechable(USUARIO_DESECHABLE)
  await abrirConfiguracionesComo(page, 'director')

  const fila = page.getByRole('row', { name: /Cuenta Desechable/ })
  await expect(fila).toContainText(USUARIO_DESECHABLE)
  await fila.getByRole('button', { name: 'Cambiar usuario de Cuenta Desechable' }).click()

  const dialogo = page.getByRole('dialog', { name: 'Cambiar usuario' })
  const campo = dialogo.getByLabel('Usuario de Cuenta Desechable')
  await expect(campo).toHaveValue(USUARIO_DESECHABLE)

  // Uno que ya tiene otra cuenta: lo dice junto al campo y no cierra.
  await campo.fill(USUARIOS_PRUEBA.residente.usuario)
  await dialogo.getByRole('button', { name: 'Guardar usuario' }).click()
  await expect(dialogo.getByText('Ya existe una cuenta con ese usuario.')).toBeVisible()

  // Con mayúsculas: se guarda normalizado.
  await campo.fill('Cuenta.Cambiada')
  await dialogo.getByRole('button', { name: 'Guardar usuario' }).click()
  await expect(dialogo.getByRole('status')).toHaveText(`Cuenta Desechable ahora entra con el usuario ${USUARIO_DESECHABLE_NUEVO}.`)
  const listo = dialogo.getByRole('button', { name: 'Listo' })
  await expect(listo).toBeFocused()
  await listo.click()
  await expect(dialogo).toBeHidden()
  await expect(fila).toContainText(USUARIO_DESECHABLE_NUEVO)

  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await iniciarSesion(page, USUARIO_DESECHABLE)
  await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)

  // La contraseña no cambió.
  await iniciarSesion(page, USUARIO_DESECHABLE_NUEVO)
  await expect(page).toHaveURL(/\/comidas\/semana$/)
})

test('el Director también cambia su propio usuario', async ({ page }) => {
  await abrirConfiguracionesComo(page, 'director')
  const propia = page.getByRole('row', { name: /Directora Prueba/ })
  await expect(propia.getByRole('button', { name: 'Cambiar usuario de Directora Prueba' })).toBeVisible()
})

test('cambiar la propia contraseña pide la actual y no cierra la sesión', async ({ page }) => {
  const nueva = 'otra-clave-789'
  await abrirConfiguracionesComo(page, 'residente')

  await page.getByLabel('Contraseña actual').fill('incorrecta-000')
  await page.getByLabel('Contraseña nueva').fill(nueva)
  await page.getByLabel('Repetir contraseña').fill(nueva)
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click()
  // Por texto, no con getByRole('alert'): Next.js agrega su propio anunciador de rutas con ese rol.
  await expect(page.getByText('La contraseña actual no es correcta.')).toBeVisible()

  // React vacía el formulario después de cada envío: se completa de nuevo.
  await page.getByLabel('Contraseña actual').fill(CONTRASENA_PRUEBA)
  await page.getByLabel('Contraseña nueva').fill(nueva)
  await page.getByLabel('Repetir contraseña').fill(nueva)
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click()
  await expect(page.getByText('Contraseña actualizada.')).toBeVisible()

  // La verificación de la actual no tocó las cookies: la sesión sigue abierta.
  await page.reload()
  await expect(page).toHaveURL(/\/configuraciones$/)
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible()

  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await iniciarSesion(page, USUARIOS_PRUEBA.residente.usuario, nueva)
  await expect(page).toHaveURL(/\/comidas\/semana$/)
})

test('el Director crea una cuenta con contraseña temporal y la persona debe cambiarla al entrar', async ({ page }) => {
  await abrirConfiguracionesComo(page, 'director')
  await page.getByRole('button', { name: '+ Nueva cuenta' }).click()

  const dialogo = page.getByRole('dialog', { name: 'Nueva cuenta' })
  await dialogo.getByLabel('Rol').selectOption('residente')
  // No se pide ningún correo: se entra con el usuario.
  await expect(dialogo.getByLabel('Correo')).toHaveCount(0)
  await dialogo.getByLabel('Usuario').fill('Cuenta.Nueva')
  await dialogo.getByLabel('Nombre completo').fill('Cuenta Nueva')
  await dialogo.getByLabel('Siglas').fill('cn')
  await dialogo.getByRole('button', { name: 'Generar' }).click()
  await expect(dialogo.getByLabel('Contraseña temporal')).toHaveValue(FORMATO_TEMPORAL)
  const temporal = await dialogo.getByLabel('Contraseña temporal').inputValue()

  await dialogo.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(dialogo.getByRole('status')).toHaveText(`Cuenta creada: Cuenta Nueva. Usuario: ${USUARIO_CUENTA_NUEVA}.`)
  await expect(dialogo).toContainText(temporal)
  await dialogo.getByRole('button', { name: 'Listo' }).click()
  await expect(dialogo).toBeHidden()

  const fila = page.getByRole('row', { name: /Cuenta Nueva/ })
  await expect(fila).toContainText('CN')
  await expect(fila).toContainText(USUARIO_CUENTA_NUEVA)
  await expect(fila).toContainText('Cambio de contraseña pendiente')

  // Auth la conoce por una dirección interna: en ningún lado quedó un correo de la persona.
  const admin = clienteAdminPrueba()
  const { data: perfil } = await admin.from('perfiles').select('id').eq('usuario', USUARIO_CUENTA_NUEVA).single()
  const { data: cuenta } = await admin.auth.admin.getUserById(perfil!.id)
  expect(esDireccionInterna(cuenta.user?.email)).toBe(true)

  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await iniciarSesion(page, USUARIO_CUENTA_NUEVA, temporal)
  await expect(page).toHaveURL(/\/cambiar-contrasena$/)
})

test('el Director crea una cuenta de Administración sin escribir ningún nombre', async ({ page }) => {
  await abrirConfiguracionesComo(page, 'director')
  await page.getByRole('button', { name: '+ Nueva cuenta' }).click()

  const dialogo = page.getByRole('dialog', { name: 'Nueva cuenta' })
  await dialogo.getByLabel('Rol').selectOption('administracion')
  // La casa no ve el nombre real de Administración: no se pide, y se dice cómo se va a llamar.
  await expect(dialogo.getByLabel('Nombre completo')).toHaveCount(0)
  await expect(dialogo.getByLabel('Siglas')).toHaveCount(0)
  await expect(dialogo).toContainText(/Se va a llamar «Administración \d+» \(A\d+\)/)
  // El usuario viene propuesto y se puede cambiar.
  await expect(dialogo.getByLabel('Usuario')).toHaveValue(/^admin\.\d+$/)
  await dialogo.getByLabel('Usuario').fill(USUARIO_ADMIN_NUEVO)
  await dialogo.getByRole('button', { name: 'Generar' }).click()
  const temporal = await dialogo.getByLabel('Contraseña temporal').inputValue()
  await dialogo.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(dialogo.getByRole('status')).toHaveText(/^Cuenta creada: Administración \d+\. Usuario: admin\.e2e\.$/)
  await dialogo.getByRole('button', { name: 'Listo' }).click()

  const { data } = await clienteAdminPrueba().from('perfiles').select('nombre, siglas, rol').eq('usuario', USUARIO_ADMIN_NUEVO).single()
  expect(data?.rol).toBe('administracion')
  expect(data?.nombre).toMatch(/^Administración \d+$/)
  expect(data?.siglas).toMatch(/^A\d+$/)
  await expect(page.getByRole('row', { name: new RegExp(data!.nombre) })).toContainText(USUARIO_ADMIN_NUEVO)

  // Esa cuenta entra con su usuario, y en Mi cuenta su nombre no se puede cambiar.
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  // Sin esperar el cierre, /login todavía ve la sesión del Director y redirige: no hay formulario.
  await expect(page).toHaveURL(/\/login$/)
  await iniciarSesion(page, USUARIO_ADMIN_NUEVO, temporal)
  await expect(page).toHaveURL(/\/cambiar-contrasena$/)
  await page.getByLabel('Contraseña nueva').fill('clave-de-admin-456')
  await page.getByLabel('Repetir contraseña').fill('clave-de-admin-456')
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
  await page.goto('/configuraciones')
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(data!.nombre)
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveAttribute('readonly', '')
  await expect(page.getByLabel('Siglas', { exact: true })).toHaveAttribute('readonly', '')
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0)
})

test('el Director pone una contraseña temporal a una cuenta existente y la persona debe cambiarla', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await abrirConfiguracionesComo(page, 'director')
  await page.getByRole('button', { name: 'Contraseña temporal de Residente Dos' }).click()

  const dialogo = page.getByRole('dialog', { name: 'Contraseña temporal' })
  const campo = dialogo.getByRole('textbox', { name: 'Contraseña temporal' })
  await expect(dialogo).toContainText(`Residente Dos (${USUARIOS_PRUEBA.residente2.usuario})`)
  await dialogo.getByRole('button', { name: 'Generar' }).click()
  await expect(campo).toHaveValue(FORMATO_TEMPORAL)
  const temporal = await campo.inputValue()

  await dialogo.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(dialogo.getByRole('status')).toHaveText('Contraseña temporal asignada a Residente Dos.')
  await expect(dialogo).toContainText(temporal)

  // El foco pasa a "Listo" y solo ese botón cierra el paso: Escape no descarta la contraseña.
  const listo = dialogo.getByRole('button', { name: 'Listo' })
  await expect(listo).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialogo).toBeVisible()

  await dialogo.getByRole('button', { name: 'Copiar' }).click()
  await expect(page.getByText('Contraseña copiada.')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(temporal)

  await listo.click()
  await expect(dialogo).toBeHidden()
  await expect(page.getByRole('row', { name: /Residente Dos/ })).toContainText('Cambio de contraseña pendiente')

  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await iniciarSesion(page, USUARIOS_PRUEBA.residente2.usuario, temporal)
  await expect(page).toHaveURL(/\/cambiar-contrasena$/)
})

test('el Director desactiva una cuenta, que ya no puede entrar, y la reactiva', async ({ page, browser }) => {
  await abrirConfiguracionesComo(page, 'director')
  const fila = page.getByRole('row', { name: /Residente Dos/ })

  await fila.getByRole('button', { name: 'Desactivar a Residente Dos' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Desactivar cuenta' })
  await expect(dialogo).toContainText('Residente Dos')
  await dialogo.getByRole('button', { name: 'Desactivar' }).click()
  await expect(dialogo).toBeHidden()
  await expect(fila).toContainText('Desactivada')

  const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL })
  const otra = await contexto.newPage()
  await iniciarSesion(otra, USUARIOS_PRUEBA.residente2.usuario)
  await expect(otra.getByText('Tu cuenta está desactivada. Hablá con el Director.')).toBeVisible()

  await fila.getByRole('button', { name: 'Reactivar a Residente Dos' }).click()
  await expect(fila.getByText('Activa', { exact: true })).toBeVisible()

  await iniciarSesion(otra, USUARIOS_PRUEBA.residente2.usuario)
  await expect(otra).toHaveURL(/\/comidas\/semana$/)
  await contexto.close()
})

test('el Director elimina para siempre una cuenta desactivada; una activa no ofrece eliminarla', async ({ page }) => {
  await crearCuentaDesechable(USUARIO_DESECHABLE)
  await abrirConfiguracionesComo(page, 'director')
  const fila = page.getByRole('row', { name: /Cuenta Desechable/ })
  const eliminar = fila.getByRole('button', { name: 'Eliminar a Cuenta Desechable' })

  // Dos pasos a propósito: mientras está activa no hay "Eliminar".
  await expect(eliminar).toHaveCount(0)
  await fila.getByRole('button', { name: 'Desactivar a Cuenta Desechable' }).click()
  await page.getByRole('dialog', { name: 'Desactivar cuenta' }).getByRole('button', { name: 'Desactivar' }).click()
  await expect(fila).toContainText('Desactivada')

  await eliminar.click()
  const dialogo = page.getByRole('dialog', { name: 'Eliminar cuenta' })
  await expect(dialogo).toContainText(`¿Eliminar definitivamente la cuenta de Cuenta Desechable (${USUARIO_DESECHABLE})?`)
  // Antes de confirmar dice qué se pierde.
  await expect(dialogo).toContainText('Se borra todo lo suyo: sus comidas, su plan, sus ausencias y sus avisos. No tiene mensajes.')
  await expect(dialogo).toContainText('No se puede deshacer.')

  // Cancelar no borra nada.
  await dialogo.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialogo).toBeHidden()
  await expect(fila).toBeVisible()

  await eliminar.click()
  await dialogo.getByRole('button', { name: 'Eliminar definitivamente' }).click()
  await expect(page.getByText('Cuenta eliminada: Cuenta Desechable.')).toBeVisible()
  await expect(fila).toHaveCount(0)
  const { data } = await clienteAdminPrueba().from('perfiles').select('id').eq('usuario', USUARIO_DESECHABLE)
  expect(data).toEqual([])

  // Ya no existe: ni entra, ni se distingue de un usuario que nunca existió.
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await iniciarSesion(page, USUARIO_DESECHABLE)
  await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible()
})

test('el Director cambia el rol de otra cuenta pero no el propio', async ({ page }) => {
  await abrirConfiguracionesComo(page, 'director')
  await expect(page.getByRole('heading', { name: 'Horas límite' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Gestión de usuarios' })).toBeVisible()

  await expect(page.getByLabel('Rol', { exact: true })).toBeDisabled()
  const propia = page.getByRole('row', { name: /Directora Prueba/ })
  await expect(propia.getByRole('combobox', { name: 'Rol de Directora Prueba' })).toBeDisabled()
  await expect(propia.getByRole('button', { name: 'Desactivar a Directora Prueba' })).toHaveCount(0)

  // Pasar a Administración cambia el nombre por uno genérico: pide confirmación y lo dice antes.
  await page.getByRole('combobox', { name: 'Rol de Residente Dos' }).selectOption('administracion')
  const dialogo = page.getByRole('dialog', { name: 'Cambiar rol' })
  await expect(dialogo).toContainText('¿Pasar a Administración a Residente Dos?')
  await expect(dialogo).toContainText(/Va a llamarse «Administración \d+» \(A\d+\)/)
  await dialogo.getByRole('button', { name: 'Pasar a Administración' }).click()
  await expect(dialogo).toBeHidden()
  await expect(page.getByText('Residente Dos pasó a Administración.')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('row', { name: /Residente Dos/ })).toHaveCount(0)
  const { data } = await clienteAdminPrueba()
    .from('perfiles')
    .select('nombre, siglas, rol')
    .eq('usuario', USUARIOS_PRUEBA.residente2.usuario)
    .single()
  expect(data?.rol).toBe('administracion')
  expect(data?.nombre).toMatch(/^Administración \d+$/)
  await expect(page.getByRole('combobox', { name: `Rol de ${data!.nombre}` })).toHaveValue('administracion')

  // Al salir de Administración conserva el nombre genérico hasta que la persona ponga el suyo.
  await page.getByRole('combobox', { name: `Rol de ${data!.nombre}` }).selectOption('residente')
  await expect(page.getByText('Rol actualizado. Pedile que ponga su nombre en Ajustes → Mi cuenta.')).toBeVisible()
})

test('dar o quitar el rol Director pide confirmación', async ({ page }) => {
  await abrirConfiguracionesComo(page, 'director')
  const rol = page.getByRole('combobox', { name: 'Rol de Residente Dos' })
  const dialogo = page.getByRole('dialog', { name: 'Cambiar rol' })

  // Cancelar deja el rol como estaba.
  await rol.selectOption('director')
  await expect(dialogo).toContainText('¿Dar el rol Director a Residente Dos?')
  await expect(rol).toHaveValue('residente')
  await dialogo.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialogo).toBeHidden()
  await expect(rol).toHaveValue('residente')

  await rol.selectOption('director')
  await dialogo.getByRole('button', { name: 'Dar rol Director' }).click()
  await expect(dialogo).toBeHidden()
  await expect(page.getByText('Rol actualizado para Residente Dos.')).toBeVisible()
  await expect(rol).toHaveValue('director')

  await rol.selectOption('residente')
  await expect(dialogo).toContainText('¿Quitar el rol Director a Residente Dos? Pasará a tener el rol Residente.')
  await dialogo.getByRole('button', { name: 'Quitar rol Director' }).click()
  await expect(dialogo).toBeHidden()
  await expect(rol).toHaveValue('residente')
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Rol de Residente Dos' })).toHaveValue('residente')
})

test('el Director cambia la hora límite del almuerzo', async ({ page }) => {
  await abrirConfiguracionesComo(page, 'director')
  const almuerzo = page.getByRole('group', { name: 'Almuerzo' })

  await almuerzo.getByLabel('Día').selectOption('0')
  await almuerzo.getByLabel('Hora').fill('11:30')
  await page.getByRole('button', { name: 'Guardar horas límite' }).click()
  await expect(page.getByText('Horas límite actualizadas.')).toBeVisible()
  await expect(almuerzo).toContainText('Vigente: cierra el mismo día a las 11:30')

  await page.reload()
  await expect(page.getByRole('group', { name: 'Almuerzo' }).getByLabel('Hora')).toHaveValue('11:30')
})

test('después de guardar, las horas límite conservan el día elegido en el formulario', async ({ page }) => {
  await abrirConfiguracionesComo(page, 'director')
  const almuerzo = page.getByRole('group', { name: 'Almuerzo' })

  await almuerzo.getByLabel('Día').selectOption('-1')
  await page.getByRole('button', { name: 'Guardar horas límite' }).click()
  await expect(page.getByText('Horas límite actualizadas.')).toBeVisible()
  await expect(almuerzo).toContainText('Vigente: cierra el día anterior a las')
  // React 19 resetea el formulario después de la acción: el select no debe volver a "Mismo día".
  await expect(almuerzo.getByLabel('Día')).toHaveValue('-1')
})
