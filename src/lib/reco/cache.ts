// src/lib/reco/cache.ts
// In-memory cache per le raccomandazioni (server-side, per worker process)
// Estratto da api/recommendations/route.ts — Fix #14 Repair Bible
//
// TTL: 10 minuti. Al restart del processo il cache si svuota (OK per Vercel).
// Max 500 entries per evitare memory leak.

import type { MemCacheEntry, TasteProfile, Recommendation } from './types'

const MEM_CACHE = new Map<string, MemCacheEntry>()
const MEM_CACHE_TTL_MS = 10 * 60 * 1000 // 10 min

export function memCacheGet(userId: string): MemCacheEntry | null {
  const entry = MEM_CACHE.get(userId)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    MEM_CACHE.delete(userId)
    return null
  }
  return entry
}

export function memCacheSet(
  userId: string,
  data: Record<string, Recommendation[]>,
  tasteProfile: TasteProfile
): void {
  if (MEM_CACHE.size >= 500) {
    const first = MEM_CACHE.keys().next().value
    if (first) MEM_CACHE.delete(first)
  }
  MEM_CACHE.set(userId, {
    data,
    tasteProfile,
    expiresAt: Date.now() + MEM_CACHE_TTL_MS,
  })
}

export function memCacheInvalidate(userId: string): void {
  MEM_CACHE.delete(userId)
}