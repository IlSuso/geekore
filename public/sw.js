// public/sw.js
// M8: Aggiunta Background Sync API per azioni offline
// Le azioni critiche (update progresso, like) vengono salvate in IndexedDB
// quando offline e riprocessate automaticamente quando la connessione torna.

const CACHE_NAME = 'geekore-v3'
const DATA_CACHE = 'geekore-data-v3'
const SYNC_QUEUE_DB = 'geekore-sync-queue'
const SYNC_TAG = 'geekore-bg-sync'

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/offline.html',
]

const CACHEABLE_PAGES = [
  '/feed',
  '/for-you',
  '/discover',
  '/profile',
  '/notifications',
  '/wishlist',
]

const CACHEABLE_API = [
  '/api/recommendations',
  '/api/activity',
  '/api/news',
]

// M8: API endpoint che vengono messe in coda quando offline
const SYNC_ELIGIBLE_PATTERNS = [
  { pattern: /\/api\/social\/like/, method: 'POST' },
  { pattern: /\/api\/social\/like/, method: 'DELETE' },
  { pattern: /\/user_media_entries/, method: 'PATCH' },
]

const DATA_CACHE_TTL = 10 * 60 * 1000

// ── IndexedDB helper ──────────────────────────────────────────────────────────

function openSyncDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SYNC_QUEUE_DB, 1)
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('queue', { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function enqueueAction(request) {
  const db = await openSyncDB()
  const body = await request.clone().text().catch(() => null)
  const entry = {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body,
    timestamp: Date.now(),
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite')
    tx.objectStore('queue').add(entry)
    tx.oncomplete = resolve
    tx.onerror = reject
  })
}

async function flushQueue() {
  const db = await openSyncDB()
  const items = await new Promise((resolve) => {
    const tx = db.transaction('queue', 'readonly')
    const req = tx.objectStore('queue').getAll()
    req.onsuccess = () => resolve(req.result)
  })

  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body || undefined,
      })
      if (response.ok) {
        // Rimuovi dalla coda se riuscito
        await new Promise((resolve) => {
          const tx = db.transaction('queue', 'readwrite')
          tx.objectStore('queue').delete(item.id)
          tx.oncomplete = resolve
        })
      }
    } catch {
      // Lascia in coda, riproverà al prossimo sync
    }
  }
}

// ── Install ───────────────────────────────────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(STATIC_ASSETS.map(url =>
        cache.add(url).catch(() => {})
      ))
    )
  )
  self.skipWaiting()
})

// ── Activate ──────────────────────────────────────────────────────────────────

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

// ── Push ──────────────────────────────────────────────────────────────────────

self.addEventListener('push', event => {
  if (!event.data) return
  let payload
  try { payload = event.data.json() }
  catch { payload = { title: 'Geekore', body: event.data.text() } }
  const { title = 'Geekore', body = '', icon, url = '/', tag } = payload
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon || '/icons/icon-192.png',
      badge: '/icons/favicon-32.png',
      tag: tag || 'geekore-notif',
      data: { url },
      vibrate: [200, 100, 200],
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url === url && 'focus' in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})

// ── M8: Background Sync ───────────────────────────────────────────────────────

self.addEventListener('sync', event => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(
      flushQueue().then(() => {
        // Notifica i client che la sync è completata
        self.clients.matchAll().then(clients => {
          clients.forEach(client => client.postMessage({ type: 'SYNC_COMPLETE' }))
        })
      })
    )
  }
})

// ── Fetch ─────────────────────────────────────────────────────────────────────

function addTimestamp(response) {
  const headers = new Headers(response.headers)
  headers.set('sw-cached-at', Date.now().toString())
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function isExpired(response) {
  const cachedAt = response.headers.get('sw-cached-at')
  if (!cachedAt) return true
  return Date.now() - parseInt(cachedAt) > DATA_CACHE_TTL
}

self.addEventListener('fetch', event => {
  const { pathname } = new URL(event.request.url)

  // ── Static Next.js assets → cache-first ────────────────────────────────────
  if (pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request)
        if (cached) return cached
        const response = await fetch(event.request)
        if (response.ok) cache.put(event.request, response.clone())
        return response
      })
    )
    return
  }

  // ── Next.js images → stale-while-revalidate ─────────────────────────────────
  if (pathname.startsWith('/_next/image')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request)
        const networkPromise = fetch(event.request)
          .then(response => { cache.put(event.request, response.clone()); return response })
          .catch(() => cached)
        return cached || networkPromise
      })
    )
    return
  }

  // ── M8: Azioni mutanti → se offline, metti in coda ──────────────────────────
  const isSyncEligible = SYNC_ELIGIBLE_PATTERNS.some(
    p => p.pattern.test(event.request.url) && p.method === event.request.method
  )

  if (isSyncEligible && ['POST', 'PATCH', 'DELETE'].includes(event.request.method)) {
    event.respondWith(
      fetch(event.request.clone()).catch(async () => {
        // Offline: salva in coda e registra Background Sync
        await enqueueAction(event.request)
        try {
          await self.registration.sync.register(SYNC_TAG)
        } catch {}
        // Risposta ottimistica per non bloccare la UI
        return new Response(
          JSON.stringify({ queued: true, message: 'Azione salvata, verrà sincronizzata quando online' }),
          { status: 202, headers: { 'Content-Type': 'application/json', 'X-Queued': 'true' } }
        )
      })
    )
    return
  }

  // ── API cacheable → network-first con fallback TTL ──────────────────────────
  const isCacheableApi = CACHEABLE_API.some(p => pathname.startsWith(p))
  if (isCacheableApi && event.request.method === 'GET') {
    event.respondWith(
      caches.open(DATA_CACHE).then(async cache => {
        try {
          const response = await fetch(event.request)
          if (response.ok) cache.put(event.request, addTimestamp(response.clone()))
          return response
        } catch {
          const cached = await cache.match(event.request)
          if (cached && !isExpired(cached)) return cached
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

  // ── API non cacheable → network-only ────────────────────────────────────────
  if (pathname.startsWith('/api/')) return

  // ── Pagine UI → network-first con fallback offline ──────────────────────────
  const isCacheablePage = CACHEABLE_PAGES.some(p => pathname === p || pathname.startsWith(p + '/'))
  if (isCacheablePage || pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()))
          }
          return response
        })
        .catch(async () => {
          const cached = await caches.match(event.request)
          if (cached) return cached
          const home = await caches.match('/')
          if (home) return home
          const offline = await caches.match('/offline.html')
          return offline || new Response(
            '<html><body><h1>Offline</h1><p>Connettiti a Internet per usare Geekore.</p></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          )
        })
    )
    return
  }
})

// ── Message ───────────────────────────────────────────────────────────────────

self.addEventListener('message', event => {
  if (event.data?.type === 'CACHE_URLS' && Array.isArray(event.data.urls)) {
    caches.open(DATA_CACHE).then(cache =>
      Promise.allSettled(
        event.data.urls.map(url =>
          fetch(url).then(r => r.ok ? cache.put(url, addTimestamp(r)) : null).catch(() => {})
        )
      )
    )
  }
  if (event.data?.type === 'CLEAR_DATA_CACHE') {
    caches.delete(DATA_CACHE)
  }
  // M8: forza flush della coda manualmente (es. quando l'utente torna online)
  if (event.data?.type === 'FLUSH_SYNC_QUEUE') {
    flushQueue()
  }
})
