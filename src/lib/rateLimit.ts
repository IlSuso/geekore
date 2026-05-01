/**
 * Rate limiter leggero per le API route di Next.js.
 *
 * - rateLimit(): sync, fallback in-memory storico.
 * - rateLimitAsync(): usa Upstash Redis REST se configurato, altrimenti fallback in-memory.
 *
 * Env opzionali per produzione multi-istanza:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
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

function buildKey(request: Request, options: RateLimitOptions): string {
  const { prefix = 'rl', userId } = options

  if (userId) {
    return `${prefix}:user:${userId}`
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'

  return `${prefix}:ip:${ip}`
}

function buildHeaders(limit: number, remaining: number, resetAt: number, now: number, ok: boolean): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
    'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
    ...(ok ? {} : { 'Retry-After': String(Math.max(1, Math.ceil((resetAt - now) / 1000))) }),
  }
}

export function rateLimit(
  request: Request,
  options: RateLimitOptions
): RateLimitResult {
  const { limit, windowMs = 60_000 } = options
  const key = buildKey(request, options)
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
    headers: buildHeaders(limit, remaining, entry.resetAt, now, ok),
  }
}

async function upstashCommand<T = any>(baseUrl: string, token: string, command: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.error) return null
    return data?.result as T
  } catch {
    return null
  }
}

async function rateLimitWithUpstash(key: string, limit: number, windowMs: number): Promise<RateLimitResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  const baseUrl = url.replace(/\/$/, '')
  const now = Date.now()

  const count = Number(await upstashCommand<number>(baseUrl, token, ['INCR', key]))
  if (!Number.isFinite(count) || count <= 0) return null

  if (count === 1) {
    await upstashCommand(baseUrl, token, ['PEXPIRE', key, windowMs])
  }

  let ttl = Number(await upstashCommand<number>(baseUrl, token, ['PTTL', key]))
  if (!Number.isFinite(ttl) || ttl <= 0) {
    ttl = windowMs
    await upstashCommand(baseUrl, token, ['PEXPIRE', key, windowMs])
  }

  const resetAt = now + ttl
  const remaining = Math.max(0, limit - count)
  const ok = count <= limit

  return {
    ok,
    remaining,
    resetAt,
    headers: buildHeaders(limit, remaining, resetAt, now, ok),
  }
}

export async function rateLimitAsync(
  request: Request,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { limit, windowMs = 60_000 } = options
  const key = buildKey(request, options)
  const redisResult = await rateLimitWithUpstash(key, limit, windowMs)
  return redisResult || rateLimit(request, options)
}
