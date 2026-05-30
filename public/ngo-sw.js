// NOUR field service worker. Caches the field-view shell so it loads with no
// connection. Queued writes (check-in / panic) are handled in-page via IndexedDB
// and the window 'online' event — kept out of the SW for reliability.

const CACHE = 'nour-field-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add('/ngo/field')).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return // never cache safety writes

  // Navigations: network-first, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {}); return res })
        .catch(() => caches.match(req).then((m) => m || caches.match('/ngo/field'))),
    )
    return
  }

  // Static assets: cache-first, then network (and cache it for next time).
  if (/\.(js|css|woff2?|png|svg|ico)$/.test(new URL(req.url).pathname)) {
    event.respondWith(
      caches.match(req).then((m) => m || fetch(req).then((res) => { caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {}); return res }).catch(() => m)),
    )
  }
})
