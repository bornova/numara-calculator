/**
 * Numara Calculator service worker.
 *
 * Pre-caches the application shell so Numara loads instantly and keeps working
 * offline, and satisfies the service worker requirement for installable PWAs.
 */
const VERSION = '__VERSION__'
const CACHE_NAME = `numara-${VERSION}`

// Application shell required to boot and run offline. The list is injected at
// build time from the contents of the build directory.
const PRECACHE_URLS = ['__PRECACHE__']

// Pre-cache the app shell. Individual failures are tolerated so a single
// missing resource can never block installation.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  )
})

// Drop caches from previous versions and take control of open pages.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  // Only handle same-origin requests. Cross-origin calls (e.g. currency rates)
  // go straight to the network.
  if (new URL(request.url).origin !== self.location.origin) return

  // Network-first for navigations so new releases are picked up, falling back
  // to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()

          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))

          return response
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    )

    return
  }

  // Stale-while-revalidate for static assets: serve from cache for speed and
  // refresh the entry in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.status === 200 && response.type === 'basic') {
            const copy = response.clone()

            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }

          return response
        })
        .catch(() => cached)

      return cached || network
    })
  )
})
