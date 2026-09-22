import { expect, test, type Page } from '@playwright/test'
import {
  asegurarUsuariosPrueba,
  clienteAdminPrueba,
  clienteComo,
  CONTRASENA_PRUEBA,
  nombresQueNoDebeVer,
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

/** Administración solo ve siglas: ningún nombre ajeno en pantalla ni en el HTML (datos de hidratación incluidos). */
async function sinNombresAjenos(page: Page, clave: ClaveUsuario) {
  const html = await page.content()
  for (const nombre of nombresQueNoDebeVer(clave)) {
    expect(html, `"${nombre}" no debería llegar al navegador de ${clave}`).not.toContain(nombre)
  }
}

/**
 * Inserta un mensaje a nombre de `clave` con la llave secreta, ya aprobado: representa contenido que
 * ya estaba ahí antes del test, no un mensaje que el propio test está mandando a moderación. Con la
 * llave secreta el trigger lo deja "pendiente" (no hay auth.uid() de Director en esa sesión), así que
 * el Director lo aprueba aparte.
 */
async function sembrarMensaje(clave: ClaveUsuario, texto: string) {
  const admin = clienteAdminPrueba()
  const { data: perfil, error } = await admin
    .from('perfiles')
    .select('id')
    .eq('correo', USUARIOS_PRUEBA[clave].correo)
    .single()
  if (error) throw error
  const { data: mensaje, error: errorMensaje } = await admin
    .from('mensajes')
    .insert({ autor_id: perfil.id, texto })
    .select('id')
    .single()
  if (errorMensaje) throw errorMensaje

  const director = await clienteComo('director')
  const { error: errorAprobar } = await director.from('mensajes').update({ estado: 'aprobado' }).eq('id', mensaje.id)
  if (errorAprobar) throw errorAprobar
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

test('sin conexión, publicar avisa y conserva el texto; al volver la conexión se publica', async ({ page, context }) => {
  const texto = textoUnico('sin conexión')
  await iniciarSesion(page, 'residente')
  await page.goto('/mensajes')
  // Primero que termine la recarga del primer SUBSCRIBED: si no, el corte también la hace fallar y la
  // prueba depende de cuándo llega.
  await expect(page.locator('.feed-mensajes')).toHaveAttribute('data-conexion', 'en-vivo', { timeout: 20_000 })

  await page.getByLabel('Nuevo mensaje').fill(texto)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Publicar' }).click()
  await expect(page.locator('.toast')).toContainText('No se pudo conectar')
  await expect(page.getByLabel('Nuevo mensaje')).toHaveValue(texto)

  // La sección sigue funcionando (no la reemplazó error.tsx).
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Publicar' }).click()
  await expect(tarjeta(page, texto)).toBeVisible()
  await expect(page.getByLabel('Nuevo mensaje')).toHaveValue('')
})

test('al conectarse recarga lo publicado después de generar la página', async ({ page }) => {
  const texto = textoUnico('antes de suscribirse')
  await iniciarSesion(page, 'administracion')

  // El mensaje se crea cuando la página ya se generó y antes de abrir el WebSocket de Realtime:
  // no viene en el HTML ni llega como evento; solo lo trae la recarga del primer SUBSCRIBED.
  let sembrado: Promise<void> | undefined
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, async (ws) => {
    sembrado ??= sembrarMensaje('residente', texto)
    await sembrado
    ws.connectToServer()
  })
  await page.goto('/mensajes')
  await expect(page.locator('.feed-mensajes')).toHaveAttribute('data-conexion', 'en-vivo', { timeout: 20_000 })
  await expect(tarjeta(page, texto)).toBeVisible()
  // Administración ve las siglas del autor, no su nombre.
  await expect(tarjeta(page, texto)).toContainText(USUARIOS_PRUEBA.residente.siglas)
  await sinNombresAjenos(page, 'administracion')
})

test('otra sesión recibe el mensaje en tiempo real sin recargar', async ({ page, browser, baseURL }) => {
  const texto = textoUnico('tiempo real')
  await iniciarSesion(page, 'administracion')
  await page.goto('/mensajes')
  await expect(page.locator('.feed-mensajes')).toHaveAttribute('data-conexion', 'en-vivo', { timeout: 20_000 })

  const contextoAutor = await browser.newContext({ baseURL })
  try {
    const autor = await contextoAutor.newPage()
    // Director: se publica ya aprobado, así este test sigue probando el INSERT en tiempo real (no la
    // aprobación) — ese otro caso ya lo cubre el test de "aprobación, rechazo y reenvío" más abajo.
    await iniciarSesion(autor, 'director')
    await autor.goto('/mensajes')
    await autor.getByLabel('Nuevo mensaje').fill(texto)
    await autor.getByRole('button', { name: 'Publicar' }).click()
    await expect(tarjeta(autor, texto)).toBeVisible()

    await expect(tarjeta(page, texto)).toBeVisible({ timeout: 20_000 })
    await expect(tarjeta(page, texto)).toContainText(USUARIOS_PRUEBA.director.siglas)
    // También el mensaje que llega en vivo: el autor se resuelve con siglas.
    await sinNombresAjenos(page, 'administracion')
  } finally {
    await contextoAutor.close()
  }
})

test('un mensaje de Residente queda pendiente, el Director lo rechaza, el Residente lo corrige y reenvía, el Director lo aprueba', async ({
  page,
  browser,
  baseURL,
}) => {
  const texto = textoUnico('Pendiente')
  await iniciarSesion(page, 'residente')
  await page.goto('/mensajes')
  await page.getByLabel('Nuevo mensaje').fill(texto)
  await page.getByRole('button', { name: 'Publicar' }).click()
  await expect(tarjeta(page, texto)).toBeVisible()
  await expect(tarjeta(page, texto).getByText('Esperando aprobación')).toBeVisible()

  // Otro Residente y el Director, cada uno en su propio contexto de navegador (no `context.newPage()`:
  // eso compartiría cookies/localStorage con la sesión de `page` y pisaría el login de un usuario con el otro).
  const contextoOtro = await browser.newContext({ baseURL })
  const contextoDirector = await browser.newContext({ baseURL })
  try {
    // El otro Residente no lo ve todavía.
    const paginaOtro = await contextoOtro.newPage()
    await iniciarSesion(paginaOtro, 'residente2')
    await paginaOtro.goto('/mensajes')
    await expect(paginaOtro.getByText(texto)).toHaveCount(0)

    // El Director lo rechaza con motivo.
    const paginaDirector = await contextoDirector.newPage()
    await iniciarSesion(paginaDirector, 'director')
    await paginaDirector.goto('/mensajes?vista=pendientes')
    const filaPendiente = paginaDirector.locator('.pendiente-item', { hasText: texto })
    await filaPendiente.getByLabel('Motivo del rechazo (opcional)').fill('Corregí la fecha')
    await filaPendiente.getByRole('button', { name: 'Rechazar' }).click()
    await expect(filaPendiente).toHaveCount(0)

    // El Residente ve el rechazo y corrige.
    await expect(tarjeta(page, texto).getByText('Rechazado: Corregí la fecha')).toBeVisible()
    const textoCorregido = `${texto} (corregido)`
    await tarjeta(page, texto).getByRole('textbox').fill(textoCorregido)
    await tarjeta(page, texto).getByRole('button', { name: 'Corregir y reenviar' }).click()
    await expect(page.getByText('Esperando aprobación')).toBeVisible()

    // El Director lo aprueba.
    await paginaDirector.goto('/mensajes?vista=pendientes')
    await paginaDirector
      .locator('.pendiente-item', { hasText: textoCorregido })
      .getByRole('button', { name: 'Aprobar' })
      .click()

    // Aparece para todos, en tiempo real, sin recargar.
    await expect(page.getByText(textoCorregido)).toBeVisible()
    await expect(tarjeta(page, textoCorregido).getByText('Esperando aprobación')).toHaveCount(0)
    await expect(paginaOtro.getByText(textoCorregido)).toBeVisible({ timeout: 10_000 })
  } finally {
    await contextoOtro.close()
    await contextoDirector.close()
  }
})
