// DESTINAZIONE: public/sw.js
// #30: Modalità offline — cache della collezione utente.
//      Quando l'utente è offline, il profilo e la collezione mostrano
//      i dati dell'ultima visita invece di una pagina bianca.
//
// Strategia per rotta:
//   /_next/static/*  → cache-first (immutabile)
//   /                → network-first con fallback cache
//   /feed, /profile, /for-you, /discover → stale-while-revalidate
//   /api/*           → network-only (no cache dati sensibili)
//   /api/activity, /api/recommendations → cache con TTL 10 min

const CACHE_NAME = 'geekore-v2'
const DATA_CACHE = 'geekore-data-v2'

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/offline.html',
]

// Route UI da mettere in cache per offline
const CACHEABLE_PAGES = [
  '/feed',
  '/for-you',
  '/discover',
  '/profile',
  '/notifications',
  '/wishlist',
]

// API response da cacheare (dati non sensibili, TTL 10 min)
const CACHEABLE_API = [
  '/api/recommendations',
  '/api/activity',
  '/api/news',
]

const DATA_CACHE_TTL = 10 * 60 * 1000 // 10 minuti

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // addAll silenzioso: non blocca se un asset fallisce
      Promise.allSettled(STATIC_ASSETS.map(url =>
        cache.add(url).catch(() => {})
      ))
    )
  )
  self.skipWaiting()
})

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== DATA_CACHE)
          .map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// ─── Push ─────────────────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return

  let payload
  try { payload = event.data.json() }
  catch { payload = { title: 'Geekore', body: event.data.text() } }

  const { title = 'Geekore', body = '', icon, url = '/', tag } = payload

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon || '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      tag: tag || 'geekore-notification',
      renotify: true,
      data: { url },
      actions: [
        { action: 'open', title: 'Apri' },
        { action: 'dismiss', title: 'Ignora' },
      ],
    })
  )
})

// ─── Notification click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()
  if (event.action === 'dismiss') return

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(url)
          return
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})

// ─── Helpers cache ────────────────────────────────────────────────────────────

function isExpired(response) {
  if (!response) return true
  const dateHeader = response.headers.get('sw-cached-at')
  if (!dateHeader) return false // non ha TTL
  return Date.now() - parseInt(dateHeader, 10) > DATA_CACHE_TTL
}

function addTimestamp(response) {
  const headers = new Headers(response.headers)
  headers.set('sw-cached-at', String(Date.now()))
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  const { pathname } = url

  // Solo richieste same-origin
  if (url.origin !== self.location.origin) return

  // ── 1. Asset statici Next.js → cache-first (immutabili) ──────────────────
  if (pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached
        return fetch(event.request).then(response => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
          return response
        })
      })
    )
    return
  }

  // ── 2. Immagini ottimizzate Next.js → stale-while-revalidate ─────────────
  if (pathname.startsWith('/_next/image')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request)
        const networkPromise = fetch(event.request)
          .then(response => {
            cache.put(event.request, response.clone())
            return response
          })
          .catch(() => cached)
        return cached || networkPromise
      })
    )
    return
  }

  // ── 3. API cacheable → network-first con fallback e TTL ──────────────────
  const isCacheableApi = CACHEABLE_API.some(p => pathname.startsWith(p))
  if (isCacheableApi && event.request.method === 'GET') {
    event.respondWith(
      caches.open(DATA_CACHE).then(async cache => {
        try {
          const response = await fetch(event.request)
          if (response.ok) {
            cache.put(event.request, addTimestamp(response.clone()))
          }
          return response
        } catch {
          // Offline: usa cache se non scaduta
          const cached = await cache.match(event.request)
          if (cached && !isExpired(cached)) return cached
          // Cache scaduta ma siamo offline: ritorna comunque (meglio di niente)
          if (cached) return cached
          return new Response(
            JSON.stringify({ error: 'offline', cached: false }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          )
        }
      })
    )
    return
  }

  // ── 4. API non cacheable → network-only ──────────────────────────────────
  if (pathname.startsWith('/api/')) {
    // Lascia passare senza intercettare
    return
  }

  // ── 5. Pagine UI → network-first con fallback cache ───────────────────────
  const isCacheablePage = CACHEABLE_PAGES.some(p => pathname === p || pathname.startsWith(p + '/'))
  if (isCacheablePage || pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
          }
          return response
        })
        .catch(async () => {
          // Offline: prova dalla cache
          const cached = await caches.match(event.request)
          if (cached) return cached
          // Fallback alla home dalla cache
          const homeCached = await caches.match('/')
          if (homeCached) return homeCached
          // Ultimo fallback: pagina offline statica
          const offlinePage = await caches.match('/offline.html')
          return offlinePage || new Response(
            '<html><body><h1>Offline</h1><p>Connettiti a Internet per usare Geekore.</p></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          )
        })
    )
    return
  }
})

// ─── Message: forza aggiornamento cache dalla pagina ─────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'CACHE_URLS' && Array.isArray(event.data.urls)) {
    caches.open(DATA_CACHE).then(cache =>
      Promise.allSettled(
        event.data.urls.map((url) =>
          fetch(url).then(r => r.ok ? cache.put(url, addTimestamp(r)) : null).catch(() => {})
        )
      )
    )
  }

  if (event.data?.type === 'CLEAR_DATA_CACHE') {
    caches.delete(DATA_CACHE)
  }
})