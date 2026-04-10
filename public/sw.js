// public/sw.js
// Service Worker per Geekore PWA
// Gestisce: notifiche push, cache offline, background sync

const CACHE_NAME = 'geekore-v1'
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
]

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ─── Push ─────────────────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Geekore', body: event.data.text() }
  }

  const { title = 'Geekore', body = '', icon, url = '/', tag } = payload

  const options = {
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
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// ─── Notification click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()

  if (event.action === 'dismiss') return

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Se c'è già una finestra aperta, focalizzala e naviga
      for (const client of clients) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(url)
          return
        }
      }
      // Altrimenti apri una nuova finestra
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })
  )
})

// ─── Fetch (network-first per API, cache-first per assets statici) ────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Non intercettare richieste API o cross-origin
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) return

  // Cache-first per asset statici (_next/static)
  if (url.pathname.startsWith('/_next/static/')) {
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
  }
})