// src/app/trending/page.tsx
// Bacheca community: i media più aggiunti e votati questa settimana.
// Server Component — dati freschi ad ogni richiesta, rendering/localizzazione demandati a TrendingContent.

import { createClient } from '@/lib/supabase/server'
import { TrendingContent } from './TrendingContent'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export interface TrendingItem {
  title: string
  type: string
  cover_image: string | null
  coverImage?: string | null
  count: number
  avg_rating: number | null
  external_id: string | null
  rated_count?: number
  description?: string | null
  description_en?: string | null
  description_it?: string | null
  title_en?: string | null
  title_it?: string | null
  title_original?: string | null
  cover_image_en?: string | null
  cover_image_it?: string | null
  localized?: Record<string, any> | null
  year?: number | null
  genres?: string[] | null
  score?: number | null
}

function normalizeType(type: string | null | undefined): string {
  return type === 'board_game' ? 'boardgame' : (type || 'unknown')
}

function makeTrendKey(type: string, title: string, externalId?: string | null): string {
  return `${type}::${externalId || title.trim().toLowerCase()}`
}

function safeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

async function getTrending(): Promise<{ byAdditions: TrendingItem[]; byRating: TrendingItem[] }> {
  const supabase = await createClient()
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('user_media_entries')
    .select('title, type, cover_image, external_id, rating, created_at')
    .gte('created_at', oneWeekAgo)
    .not('cover_image', 'is', null)
    .not('title', 'is', null)
    .limit(1000)

  if (error || !Array.isArray(data)) return { byAdditions: [], byRating: [] }

  const addMap = new Map<string, TrendingItem & { rating_sum?: number }>()
  for (const row of data) {
    if (!row.title) continue
    const type = normalizeType(row.type)
    const rating = typeof row.rating === 'number' && row.rating > 0 ? row.rating : null
    const key = makeTrendKey(type, row.title, row.external_id)
    const existing = addMap.get(key)
    if (existing) {
      existing.count++
      if (rating != null) {
        existing.rated_count = (existing.rated_count || 0) + 1
        existing.rating_sum = (existing.rating_sum || 0) + rating
        existing.avg_rating = existing.rating_sum / existing.rated_count
      }
      if (!existing.cover_image && row.cover_image) existing.cover_image = row.cover_image
      if (!existing.coverImage && row.cover_image) existing.coverImage = row.cover_image
    } else {
      addMap.set(key, {
        title: row.title,
        type,
        cover_image: row.cover_image,
        coverImage: row.cover_image,
        external_id: row.external_id,
        count: 1,
        rated_count: rating != null ? 1 : 0,
        rating_sum: rating ?? 0,
        avg_rating: rating,
        score: safeNumber(rating),
      })
    }
  }

  const all = Array.from(addMap.values()).map(({ rating_sum, ...item }) => item)
  const topAdditions = [...all]
    .sort((a, b) => b.count - a.count || (b.avg_rating ?? 0) - (a.avg_rating ?? 0) || a.title.localeCompare(b.title))
    .slice(0, 20)
  const topByRating = all
    .filter(item => item.count >= 2 && item.avg_rating != null && (item.rated_count || 0) >= 2)
    .sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0) || b.count - a.count)
    .slice(0, 10)

  return { byAdditions: topAdditions, byRating: topByRating }
}

export default async function TrendingPage() {
  const { byAdditions, byRating } = await getTrending()
  return <TrendingContent byAdditions={byAdditions} byRating={byRating} />
}
