// src/lib/reco/cache.ts
// In-memory cache per le raccomandazioni (server-side, per worker process)
// TTL: 10 minuti. Al restart del processo il cache si svuota (OK per Vercel).
// Max 500 entries per evitare memory leak.

import type { MemCacheEntry, TasteProfile, Recommendation } from './types'

const MEM_CACHE = new Map<string, MemCacheEntry>()
const MEM_CACHE_TTL_MS = 10 * 60 * 1000

function key(userId: string, locale?: string) {
  return locale ? `${userId}:${locale}` : userId
}

export function memCacheGet(userId: string, locale?: string): MemCacheEntry | null {
  const entry = MEM_CACHE.get(key(userId, locale))
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    MEM_CACHE.delete(key(userId, locale))
    return null
  }
  return entry
}

export function memCacheSet(
  userId: string,
  data: Record<string, Recommendation[]>,
  tasteProfile: TasteProfile,
  locale?: string,
): void {
  if (MEM_CACHE.size >= 500) {
    const first = MEM_CACHE.keys().next().value
    if (first) MEM_CACHE.delete(first)
  }
  MEM_CACHE.set(key(userId, locale), {
    data,
    tasteProfile,
    expiresAt: Date.now() + MEM_CACHE_TTL_MS,
  })
}

export function memCacheInvalidate(userId: string): void {
  MEM_CACHE.delete(userId)
  MEM_CACHE.delete(`${userId}:it`)
  MEM_CACHE.delete(`${userId}:en`)
}
