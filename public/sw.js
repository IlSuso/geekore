// public/sw.js
// Service Worker Geekore — PWA offline support
// Fix: clone PRIMA di leggere il body, non dopo

const CACHE_NAME = 'geekore-v3'
const STATIC_ASSETS = [
  '/',
  '/feed',
  '/discover',
  '/manifest.json',
]

// ── Install: pre-cacha le pagine statiche ────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(STATIC_ASSETS).catch(() => {
        // Ignora errori su singole risorse (offline durante install)
      })
    )
  )
  self.skipWaiting()
})

// ── Activate: elimina cache vecchie ─────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// ── Fetch: strategia Network-first con fallback cache ───────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Ignora richieste non-GET e chiamate API/Supabase (sempre live)
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.in') ||
    url.protocol === 'chrome-extension:'
  ) return

  event.respondWith(networkFirst(request))
})

async function networkFirst(request) {
  try {
    // Fetch dalla rete
    const networkResponse = await fetch(request)

    // Salva in cache solo risposte valide — CLONE prima di qualsiasi .json()/.text()
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME)
      // .clone() deve essere chiamato PRIMA che il body venga consumato
      cache.put(request, networkResponse.clone())
    }

    return networkResponse
  } catch {
    // Rete non disponibile — prova dalla cache
    const cached = await caches.match(request)
    if (cached) return cached

    // Fallback per navigazione: mostra / dalla cache
    if (request.mode === 'navigate') {
      const root = await caches.match('/')
      if (root) return root
    }

    // Nessuna cache disponibile
    return new Response('Offline — riprova quando sei connesso', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}

// ── Push notifications ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload = { title: 'Geekore', body: 'Hai una nuova notifica', icon: '/icons/icon-192x192.png' }
  try { payload = { ...payload, ...event.data.json() } } catch {}

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      vibrate: [100, 50, 100],
      data: payload,
    })
  )
})

// ── Notification click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/notifications'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin))
      if (existing) { existing.focus(); existing.navigate(url) }
      else self.clients.openWindow(url)
    })
  )
})
