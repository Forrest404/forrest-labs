// NOUR field service worker. Caches the field-view shell so it loads with no
// connection. Queued writes (check-in / panic) are handled in-page via IndexedDB
// and the window 'online' event — kept out of the SW for reliability.
//
// IMPORTANT: this SW must NEVER trap or serve a login redirect. Earlier it cached
// navigation responses (and cache.add'd the shell at install); if the server returned
// a 307→/ngo/login (cookie momentarily absent), that login page got cached under
// /ngo/field and was then served on every refresh — logging field workers out. So now
// we only cache a CLEAN, non-redirected 200, and only fall back to cache when offline.

const CACHE = 'nour-field-v2' // bumped: v2 activate purges any poisoned v1 cache

self.addEventListener('install', () => {
  // Do NOT cache.add('/ngo/field') here — that fetch can resolve to the login page and
  // poison the shell. The shell is cached lazily on the first successful authed load.
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

  // Navigations: always go to the network. Return whatever it gives (incl. a real
  // login redirect when the session has genuinely ended). Only fall back to the cached
  // shell when the network is unreachable (offline). Cache only a clean, same-origin,
  // non-redirected 200 so the offline shell is always the authenticated page.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        if (res && res.ok && !res.redirected && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put('/ngo/field', clone)).catch(() => {})
        }
        return res
      } catch {
        const cached = await caches.match('/ngo/field')
        return cached || Response.error()
      }
    })())
    return
  }

  // Static assets: cache-first, then network (and cache it for next time).
  if (/\.(js|css|woff2?|png|svg|ico)$/.test(new URL(req.url).pathname)) {
    event.respondWith(
      caches.match(req).then((m) => m || fetch(req).then((res) => { caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {}); return res }).catch(() => m)),
    )
  }
})
