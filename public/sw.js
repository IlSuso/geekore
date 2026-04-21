// public/sw.js
// Service Worker Geekore — PWA offline support + navigation speed
// v7: network-first per nav pages — permette al middleware di intercettare redirect onboarding

const CACHE_NAME = 'geekore-v7'
const STATIC_CACHE = 'geekore-static-v7'

// Pagine navigate precachate all'installazione
const NAV_PAGES = [
  '/feed',
  '/discover',
  '/for-you',
  '/notifications',
  '/wishlist',
  '/trending',
]

// Asset statici
const STATIC_ASSETS = [
  '/manifest.json',
  '/offline.html',
]

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache =>
        cache.addAll(NAV_PAGES).catch(() => {})
      ),
      caches.open(STATIC_CACHE).then(cache =>
        cache.addAll(STATIC_ASSETS).catch(() => {})
      ),
    ])
  )
  self.skipWaiting()
})

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== STATIC_CACHE)
          .map(key => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNavPage(url) {
  return NAV_PAGES.some(p => url.pathname === p || url.pathname.startsWith(p + '/'))
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2')
  )
}

function isExternal(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.in') ||
    url.protocol === 'chrome-extension:' ||
    url.hostname.includes('steamstatic.com') ||
    url.hostname.includes('anilist.co') ||
    url.hostname.includes('tmdb.org') ||
    url.hostname.includes('igdb.com') ||
    url.hostname.includes('geekdo-images.com') ||
    url.hostname.includes('dicebear.com') ||
    url.hostname.includes('myanimelist.net') ||
    url.hostname.includes('wsrv.nl')
  )
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (isExternal(url)) return

  // Asset statici Next.js: cache-first (hanno hash nel filename, non cambiano mai)
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }

  // Pagine nav principali: network-first
  // IMPORTANTE: non usare stale-while-revalidate qui — il middleware server
  // deve sempre poter intercettare la richiesta (es. redirect onboarding)
  if (request.mode === 'navigate' && isNavPage(url)) {
    event.respondWith(networkFirst(request))
    return
  }

  // Tutto il resto: network-first con fallback cache
  event.respondWith(networkFirst(request))
})

// ── Strategie ─────────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('Offline', { status: 503 })
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  const networkPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone())
    return response
  }).catch(() => null)

  if (cached) return cached

  const networkResponse = await networkPromise
  if (networkResponse) return networkResponse

  const offlinePage = await cache.match('/offline.html')
  return offlinePage || new Response('Offline', { status: 503 })
}

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request)
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    if (request.mode === 'navigate') {
      const root = await caches.match('/feed')
      if (root) return root
    }
    return new Response('Offline — riprova quando sei connesso', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}

// ── Push notifications ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload = {
    title: 'Geekore',
    body: 'Hai una nuova notifica',
    icon: '/icons/icon-192x192.png',
    tag: 'geekore-default',
    url: '/notifications',
  }

  try { payload = { ...payload, ...event.data.json() } } catch {}

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-badge.svg',
      // FIX: queste opzioni sono fondamentali per far suonare/vibrare Android
      silent: false,
      vibrate: [200, 100, 200],
      // FIX: tag + renotify → forza la notifica anche se stessa tag è già presente
      tag: payload.tag || 'geekore-default',
      renotify: true,
      // Non richiedere interazione obbligatoria (si chiude da sola)
      requireInteraction: false,
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