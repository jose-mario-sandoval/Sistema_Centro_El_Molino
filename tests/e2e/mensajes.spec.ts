import { expect, test, type Page } from '@playwright/test'
import {
  asegurarUsuariosPrueba,
  clienteAdminPrueba,
  CONTRASENA_PRUEBA,
  USUARIOS_PRUEBA,
  type ClaveUsuario,
} from '../soporte/usuarios-prueba'

/** Todo lo que crean estas pruebas empieza así, para poder limpiarlo. */
const PREFIJO = 'e2e-mensajes'

function textoUnico(descripcion: string) {
  return `${PREFIJO} ${descripcion} ${Date.now()}`
}

async function iniciarSesion(page: Page, clave: ClaveUsuario) {
  await page.goto('/login')
  await page.getByLabel('Correo').fill(USUARIOS_PRUEBA[clave].correo)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
}

/** Inserta un mensaje a nombre de `clave` con la llave secreta. */
async function sembrarMensaje(clave: ClaveUsuario, texto: string) {
  const admin = clienteAdminPrueba()
  const { data: perfil, error } = await admin
    .from('perfiles')
    .select('id')
    .eq('correo', USUARIOS_PRUEBA[clave].correo)
    .single()
  if (error) throw error
  const { error: errorMensaje } = await admin.from('mensajes').insert({ autor_id: perfil.id, texto })
  if (errorMensaje) throw errorMensaje
}

/** La publicación (`article.msg`) que contiene `texto`. */
function tarjeta(page: Page, texto: string) {
  return page.locator('.msg', { hasText: texto })
}

test.afterEach(async () => {
  const admin = clienteAdminPrueba()
  await admin.from('mensajes').delete().like('texto', `${PREFIJO}%`)
  await admin.from('registro_moderacion').delete().like('texto_eliminado', `${PREFIJO}%`)
  await asegurarUsuariosPrueba()
})

test('un residente publica y responde', async ({ page }) => {
  const publicacion = textoUnico('publicación')
  const respuesta = textoUnico('respuesta')
  await iniciarSesion(page, 'residente')
  await page.goto('/mensajes')

  await page.getByLabel('Nuevo mensaje').fill(publicacion)
  await page.getByRole('button', { name: 'Publicar' }).click()
  await expect(tarjeta(page, publicacion)).toBeVisible()
  await expect(tarjeta(page, publicacion)).toContainText('Residente Prueba')
  await expect(page.getByLabel('Nuevo mensaje')).toHaveValue('')

  await tarjeta(page, publicacion).getByRole('button', { name: 'Responder' }).click()
  await tarjeta(page, publicacion).getByLabel('Respuesta').fill(respuesta)
  await tarjeta(page, publicacion).getByRole('button', { name: 'Enviar' }).click()
  await expect(tarjeta(page, publicacion).locator('.thread')).toContainText(respuesta)

  await page.reload()
  await expect(tarjeta(page, publicacion).locator('.thread')).toContainText(respuesta)
})

test('el Director borra un mensaje de un residente y lo ve en el registro', async ({ page }) => {
  const texto = textoUnico('moderado')
  await sembrarMensaje('residente', texto)
  await iniciarSesion(page, 'director')
  await page.goto('/mensajes')

  await tarjeta(page, texto).getByRole('button', { name: 'Eliminar' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Eliminar mensaje' })
  await expect(dialogo).toContainText('Residente Prueba')
  await expect(dialogo).toContainText('registro de moderación')
  await dialogo.getByRole('button', { name: 'Eliminar' }).click()
  await expect(tarjeta(page, texto)).toHaveCount(0)

  await page.getByRole('link', { name: 'Registro de moderación' }).click()
  await expect(page).toHaveURL(/\/mensajes\?vista=registro$/)
  const fila = page.locator('tr', { hasText: texto })
  await expect(fila).toContainText('Directora Prueba')
  await expect(fila).toContainText('Residente Prueba')
  await expect(fila).toContainText('Publicación')
})

test('un residente no ve "Eliminar" en mensajes ajenos ni el registro', async ({ page }) => {
  const ajeno = textoUnico('ajeno')
  const propio = textoUnico('propio')
  await sembrarMensaje('residente2', ajeno)
  await sembrarMensaje('residente', propio)
  await iniciarSesion(page, 'residente')
  await page.goto('/mensajes')

  // Primero lo que debe existir, para no pasar en falso antes de que cargue la página.
  await expect(tarjeta(page, propio).getByRole('button', { name: 'Eliminar' })).toHaveCount(1)
  await expect(tarjeta(page, ajeno)).toBeVisible()
  await expect(tarjeta(page, ajeno).getByRole('button', { name: 'Eliminar' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Registro de moderación' })).toHaveCount(0)

  await page.goto('/mensajes?vista=registro')
  await expect(tarjeta(page, ajeno)).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)
})

test('otra sesión recibe el mensaje en tiempo real sin recargar', async ({ page, browser, baseURL }) => {
  const texto = textoUnico('tiempo real')
  await iniciarSesion(page, 'administracion')
  await page.goto('/mensajes')
  await expect(page.locator('.feed-mensajes')).toHaveAttribute('data-conexion', 'en-vivo', { timeout: 20_000 })

  const contextoAutor = await browser.newContext({ baseURL })
  try {
    const autor = await contextoAutor.newPage()
    await iniciarSesion(autor, 'residente')
    await autor.goto('/mensajes')
    await autor.getByLabel('Nuevo mensaje').fill(texto)
    await autor.getByRole('button', { name: 'Publicar' }).click()
    await expect(tarjeta(autor, texto)).toBeVisible()

    await expect(tarjeta(page, texto)).toBeVisible({ timeout: 20_000 })
    await expect(tarjeta(page, texto)).toContainText('Residente Prueba')
  } finally {
    await contextoAutor.close()
  }
})
