/**
 * Rate limiter leggero in-memory per le API route di Next.js.
 * SEC5: supporta userId opzionale — bucket separati per autenticati vs anonimi.
 *       Un utente loggato non viene bloccato per colpa di un altro utente sullo stesso IP.
 *
 * In produzione multi-istanza usa Redis/Upstash — questo funziona
 * benissimo su Vercel con una sola istanza per cold start.
 *
 * Utilizzo (anonimo):
 *   const result = rateLimit(request, { limit: 10, windowMs: 60_000 })
 *
 * Utilizzo (autenticato):
 *   const result = rateLimit(request, { limit: 30, windowMs: 60_000, userId: user.id })
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
  /**
   * SEC5: userId opzionale — se presente, usa `prefix:user:userId` come chiave
   * invece dell'IP, evitando collateral damage su IP condivisi (NAT, VPN).
   */
  userId?: string | null
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
  const { limit, windowMs = 60_000, prefix = 'rl', userId } = options

  let key: string

  if (userId) {
    // SEC5: utente autenticato → bucket isolato per userId (non condiviso con l'IP)
    key = `${prefix}:user:${userId}`
  } else {
    // Anonimo → usa IP come prima
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown'
    key = `${prefix}:ip:${ip}`
  }

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
