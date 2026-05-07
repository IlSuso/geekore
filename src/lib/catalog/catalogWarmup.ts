import { logger } from '@/lib/logger'

const WARMUP_TYPES = ['anime', 'manga', 'movie', 'tv', 'game'] as const

type SupabaseLike = {
  from: (table: string) => any
}

export async function warmMediaCatalog(options: {
  supabase: SupabaseLike
  origin: string
  locale?: 'it' | 'en'
  maxSections?: number
}) {
  const locale = options.locale || 'it'
  const maxSections = options.maxSections ?? 3
  const results: Array<{ type: string; before: number; cursor: number; fetched: number; ok: boolean }> = []

  const counts = await Promise.all(WARMUP_TYPES.map(async (type) => {
    const { count } = await options.supabase
      .from('media_catalog')
      .select('external_id', { count: 'exact', head: true })
      .eq('media_type', type)
    return { type, count: count || 0 }
  }))

  const targets = counts
    .sort((a, b) => a.count - b.count)
    .slice(0, maxSections)

  for (const target of targets) {
    const cursor = Math.max(0, Math.floor(target.count / 60))
    try {
      const res = await fetch(`${options.origin}/api/trending?section=${target.type}&lang=${locale}&cursor=${cursor}&refreshCatalog=1`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(25_000),
      })
      const payload = await res.json().catch(() => null)
      const fetched = Array.isArray(payload) ? payload.length : 0
      results.push({ type: target.type, before: target.count, cursor, fetched, ok: res.ok })
    } catch (error: any) {
      logger.warn('media_catalog', 'warmup failed', { type: target.type, error: String(error?.message || error) })
      results.push({ type: target.type, before: target.count, cursor, fetched: 0, ok: false })
    }
  }

  return results
}
