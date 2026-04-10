/**
 * Rate limiter leggero in-memory per le API route di Next.js.
 * In produzione multi-istanza usa Redis/Upstash — questo funziona
 * benissimo su Vercel con una sola istanza per cold start.
 *
 * Utilizzo:
 *   const result = rateLimit(request, { limit: 10, windowMs: 60_000 })
 *   if (!result.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
 */

type Entry = { count: number; resetAt: number }

const store = new Map<string, Entry>()

// Pulizia periodica per evitare memory leak (ogni 5 min)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt < now) store.delete(key)
    }
  }, 5 * 60 * 1000)
}

interface RateLimitOptions {
  /** Numero massimo di richieste per finestra */
  limit: number
  /** Finestra in ms (default: 60_000 = 1 minuto) */
  windowMs?: number
  /** Prefisso per la chiave (default: ip) */
  prefix?: string
}

interface RateLimitResult {
  ok: boolean
  remaining: number
  resetAt: number
  headers: Record<string, string>
}

export function rateLimit(
  request: Request,
  options: RateLimitOptions
): RateLimitResult {
  const { limit, windowMs = 60_000, prefix = 'rl' } = options

  // Estrae IP dal header Vercel/Cloudflare, fallback a 'unknown'
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'

  const key = `${prefix}:${ip}`
  const now = Date.now()

  let entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    entry = { count: 1, resetAt: now + windowMs }
    store.set(key, entry)
  } else {
    entry.count++
  }

  const remaining = Math.max(0, limit - entry.count)
  const ok = entry.count <= limit

  return {
    ok,
    remaining,
    resetAt: entry.resetAt,
    headers: {
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
      ...(ok ? {} : { 'Retry-After': String(Math.ceil((entry.resetAt - now) / 1000)) }),
    },
  }
}