/**
 * Numara Calculator service worker.
 *
 * Pre-caches the application shell so Numara loads instantly and works offline.
 */
const VERSION = '{{VERSION}}'
const CACHE_NAME = `numara-v${VERSION}`

// Precache list dynamically injected at build time from the build directory
const PRECACHE_URLS = ['__PRECACHE__']

/**
 * Strips the `redirected` flag from a Response so browsers accept it for navigation requests.
 * @param {Response} response Fetch response.
 * @returns {Response}
 */
const cleanResponse = (response) =>
  response.redirected
    ? new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      })
    : response

// Install: Pre-cache app shell.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) =>
            fetch(new Request(url, { cache: 'reload' })).then((response) => {
              if (!response.ok) throw new Error(`Failed to precache ${url}: ${response.status}`)

              return cache.put(url, cleanResponse(response))
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  )
})

// Activate: Drop caches from previous versions and take control of clients.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      const oldKeys = keys.filter((key) => key.startsWith('numara-') && key !== CACHE_NAME)
      await Promise.all(oldKeys.map((key) => caches.delete(key)))
      await self.clients.claim()
    })
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)

  // Only handle same-origin requests. Cross-origin calls (e.g. Frankfurter currency rates) go straight to network.
  if (requestUrl.origin !== self.location.origin) return

  // Network-first for navigations so new releases are picked up, falling back to cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request.url, { cache: 'no-cache' })
        .then((response) => {
          const clean = cleanResponse(response)

          if (clean.ok) {
            const copy = clean.clone()

            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, copy))
              .catch(() => {})
          }

          return clean
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match('./index.html'))
            .then((cached) => cached || caches.match('./'))
            .then((cached) => cached || Response.error())
        )
    )

    return
  }

  // Cache-first for versioned precached static assets, falling back to network on cache miss.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        if (cached) return cached

        return fetch(request)
          .then((response) => {
            if (response.status === 200 && response.type === 'basic') {
              const clean = cleanResponse(response)
              cache.put(request, clean.clone()).catch(() => {})
              return clean
            }
            return response
          })
          .catch(() => Response.error())
      })
    )
  )
})
