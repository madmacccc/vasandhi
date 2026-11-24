const CACHE_NAME = 'sri-vasanthi-shell-v1'
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.svg', './icons/icon-512.svg']

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      const shellUrls = APP_SHELL.map(path => new URL(path, self.registration.scope).href)
      await cache.addAll(shellUrls)

      const indexUrl = new URL('./index.html', self.registration.scope).href
      const indexResponse = await fetch(indexUrl)
      if (!indexResponse.ok) throw new Error('Could not precache app entry point')
      await cache.put(indexUrl, indexResponse.clone())
      await cache.put(self.registration.scope, indexResponse.clone())

      const html = await indexResponse.text()
      const paths = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)]
        .map(match => new URL(match[1], self.registration.scope).href)
      await Promise.all(paths.map(async path => {
        const response = await fetch(path)
        if (!response.ok) throw new Error(`Could not precache app asset: ${path}`)
        await cache.put(path, response.clone())
        if (!path.split('?')[0].endsWith('.css')) return
        const css = await response.text()
        const fonts = [...css.matchAll(/url\(["']?([^)"']+)["']?\)/g)]
          .map(match => match[1])
          .filter(asset => !/^(?:data:|https?:|#)/i.test(asset))
          .map(asset => new URL(asset, self.registration.scope).href)
        await Promise.all(fonts.map(async font => {
          const fontResponse = await fetch(font)
          if (fontResponse.ok) await cache.put(font, fontResponse)
        }))
      }))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('sri-vasanthi-shell-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const shellUrl = new URL('./index.html', self.registration.scope).href
        return (await caches.match(shellUrl)) || (await caches.match(new URL('./', self.registration.scope).href))
      }),
    )
    return
  }

  if (!['script', 'style', 'font', 'image'].includes(request.destination)) return
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone()
        void caches.open(CACHE_NAME).then(cache => cache.put(request, copy))
      }
      return response
    })),
  )
})
