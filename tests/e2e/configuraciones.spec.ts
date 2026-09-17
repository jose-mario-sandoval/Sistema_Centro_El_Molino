import { expect, test, type Page } from '@playwright/test'
import { HORAS_LIMITE_POR_DEFECTO } from '../../lib/comidas/tipos'
import {
  asegurarUsuariosPrueba,
  clienteAdminPrueba,
  CONTRASENA_PRUEBA,
  USUARIOS_PRUEBA,
  type ClaveUsuario,
} from '../soporte/usuarios-prueba'

const CORREO_CUENTA_NUEVA = 'cuenta-nueva@prueba.test'
const FORMATO_TEMPORAL = /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/

async function iniciarSesion(page: Page, correo: string, contrasena: string = CONTRASENA_PRUEBA) {
  await page.goto('/login')
  await page.getByLabel('Correo').fill(correo)
  await page.getByLabel('Contraseña').fill(contrasena)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
}

async function abrirConfiguracionesComo(page: Page, clave: ClaveUsuario) {
  await iniciarSesion(page, USUARIOS_PRUEBA[clave].correo)
  await expect(page).toHaveURL(/\/comidas\/semana$/)
  await page.goto('/configuraciones')
  await expect(page.getByRole('heading', { name: 'Configuraciones' })).toBeVisible()
}

async function borrarCuentaNueva() {
  const admin = clienteAdminPrueba()
  const { data } = await admin.from('perfiles').select('id').eq('correo', CORREO_CUENTA_NUEVA).maybeSingle()
  if (!data) return
  const { error } = await admin.auth.admin.deleteUser(data.id)
  if (error) throw error
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
  await borrarCuentaNueva()
  await restaurarHorasLimite()
  await asegurarUsuariosPrueba()
})

test('un residente ve Mi cuenta pero no Horas límite ni Gestión de usuarios', async ({ page }) => {
  await abrirConfiguracionesComo(page, 'residente')
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Horas límite' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Gestión de usuarios' })).toHaveCount(0)
  await expect(page.getByLabel('Rol', { exact: true })).toBeDisabled()
})

test('un residente cambia su nombre y lo ve en la barra lateral', async ({ page }) => {
  await abrirConfiguracionesComo(page, 'residente')
  await page.getByLabel('Nombre', { exact: true }).fill('Residente Renombrado')
  await page.getByLabel('Siglas', { exact: true }).fill('rr')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Cuenta actualizada.')).toBeVisible()
  await expect(page.locator('.sidebar')).toContainText('Residente Renombrado')
  await expect(page.locator('.sidebar .avatar')).toHaveText('RR')
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
  await iniciarSesion(page, USUARIOS_PRUEBA.residente.correo, nueva)
  await expect(page).toHaveURL(/\/comidas\/semana$/)
})

test('el Director crea una cuenta con contraseña temporal y la persona debe cambiarla al entrar', async ({ page }) => {
  await abrirConfiguracionesComo(page, 'director')
  await page.getByRole('button', { name: '+ Nueva cuenta' }).click()

  const dialogo = page.getByRole('dialog', { name: 'Nueva cuenta' })
  await dialogo.getByLabel('Nombre completo').fill('Cuenta Nueva')
  await dialogo.getByLabel('Siglas').fill('cn')
  await dialogo.getByLabel('Correo').fill(CORREO_CUENTA_NUEVA)
  await dialogo.getByLabel('Rol').selectOption('residente')
  await dialogo.getByRole('button', { name: 'Generar' }).click()
  await expect(dialogo.getByLabel('Contraseña temporal')).toHaveValue(FORMATO_TEMPORAL)
  const temporal = await dialogo.getByLabel('Contraseña temporal').inputValue()

  await dialogo.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(dialogo.getByRole('status')).toHaveText(`Cuenta creada para Cuenta Nueva (${CORREO_CUENTA_NUEVA}).`)
  await expect(dialogo).toContainText(temporal)
  await dialogo.getByRole('button', { name: 'Listo' }).click()

  const fila = page.getByRole('row', { name: /Cuenta Nueva/ })
  await expect(fila).toContainText('CN')
  await expect(fila).toContainText('Cambio de contraseña pendiente')

  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await iniciarSesion(page, CORREO_CUENTA_NUEVA, temporal)
  await expect(page).toHaveURL(/\/cambiar-contrasena$/)
})

test('el Director desactiva una cuenta, que ya no puede entrar, y la reactiva', async ({ page, browser }) => {
  await abrirConfiguracionesComo(page, 'director')
  const fila = page.getByRole('row', { name: /Residente Dos/ })

  await fila.getByRole('button', { name: 'Desactivar' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Desactivar cuenta' })
  await expect(dialogo).toContainText('Residente Dos')
  await dialogo.getByRole('button', { name: 'Desactivar' }).click()
  await expect(dialogo).toBeHidden()
  await expect(fila).toContainText('Desactivada')

  const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL })
  const otra = await contexto.newPage()
  await iniciarSesion(otra, USUARIOS_PRUEBA.residente2.correo)
  await expect(otra.getByText('Tu cuenta está desactivada. Hablá con el Director.')).toBeVisible()

  await fila.getByRole('button', { name: 'Reactivar' }).click()
  await expect(fila.getByText('Activa', { exact: true })).toBeVisible()

  await iniciarSesion(otra, USUARIOS_PRUEBA.residente2.correo)
  await expect(otra).toHaveURL(/\/comidas\/semana$/)
  await contexto.close()
})

test('el Director cambia el rol de otra cuenta pero no el propio', async ({ page }) => {
  await abrirConfiguracionesComo(page, 'director')
  await expect(page.getByRole('heading', { name: 'Horas límite' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Gestión de usuarios' })).toBeVisible()

  await expect(page.getByLabel('Rol', { exact: true })).toBeDisabled()
  const propia = page.getByRole('row', { name: /Directora Prueba/ })
  await expect(propia.getByRole('combobox', { name: 'Rol de Directora Prueba' })).toBeDisabled()
  await expect(propia.getByRole('button', { name: 'Desactivar' })).toHaveCount(0)

  await page.getByRole('combobox', { name: 'Rol de Residente Dos' }).selectOption('administracion')
  await expect(page.getByText('Rol actualizado para Residente Dos.')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Rol de Residente Dos' })).toHaveValue('administracion')
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
