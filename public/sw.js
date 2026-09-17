/* global self, caches */
/* Service worker de Centro El Molino (spec §8.1). Solo guarda la página "Sin conexión"; no cachea datos. */
const CACHE = 'molino-sin-conexion-v1'
const PAGINA_SIN_CONEXION = '/sin-conexion'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(PAGINA_SIN_CONEXION, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((clave) => clave !== CACHE).map((clave) => caches.delete(clave))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE)
      return (await cache.match(PAGINA_SIN_CONEXION)) || Response.error()
    }),
  )
})

self.addEventListener('push', (event) => {
  let datos = {}
  try {
    datos = event.data ? event.data.json() : {}
  } catch {
    datos = { cuerpo: event.data ? event.data.text() : '' }
  }

  event.waitUntil(
    self.registration.showNotification(datos.titulo || 'Centro El Molino', {
      body: datos.cuerpo || '',
      icon: '/iconos/192',
      badge: '/iconos/192',
      tag: datos.etiqueta || undefined,
      data: { url: datos.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href

  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      const exacta = ventanas.find((ventana) => ventana.url === destino)
      if (exacta) return exacta.focus()

      const deLaApp = ventanas.find((ventana) => new URL(ventana.url).origin === self.location.origin)
      if (deLaApp) {
        try {
          const enfocada = await deLaApp.focus()
          return await enfocada.navigate(destino)
        } catch {
          // La ventana no está controlada por este service worker: se abre una nueva.
        }
      }

      return self.clients.openWindow(destino)
    })(),
  )
})
