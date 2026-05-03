import { NextRequest, NextResponse } from 'next/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimitAsync } from '@/lib/rateLimit'
import { getRequestLocale, normalizeLocale } from '@/lib/i18n/serverLocale'
import { ensureRecommendationDescriptionsLocale, localizeRecommendationItem } from '@/lib/i18n/recommendationLocale'

function normalizeItems(value: unknown): any[] {
  return Array.isArray(value) ? value.filter(Boolean).slice(0, 80) : []
}

function toRecommendationLike(item: any) {
  return {
    ...item,
    id: item.id || item.external_id,
    title: item.title || item.name || item.title_en || item.title_original || 'Untitled',
    type: item.type || item.media_type || 'movie',
    coverImage: item.coverImage || item.cover_image,
    matchScore: item.matchScore ?? item.match_score ?? 0,
    genres: Array.isArray(item.genres) ? item.genres : [],
    description: item.description,
    description_en: item.description_en,
    description_it: item.description_it,
    localized: item.localized,
    why: item.why || '',
  }
}

function fromRecommendationLike(item: any) {
  return {
    ...item,
    external_id: item.external_id || item.id,
    cover_image: item.cover_image || item.coverImage,
    match_score: item.match_score ?? item.matchScore,
  }
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 120, windowMs: 60_000, prefix: 'media:localize' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const locale = normalizeLocale(body?.locale) || await getRequestLocale(request)
  const items = normalizeItems(body?.items).map(toRecommendationLike)
  if (items.length === 0) return NextResponse.json({ items: [] }, { headers: rl.headers })

  const withDescriptions = await ensureRecommendationDescriptionsLocale(items as any, locale, { maxSync: 80 })
  const localized = withDescriptions.map(item => fromRecommendationLike(localizeRecommendationItem(item as any, locale)))

  return NextResponse.json({ items: localized }, { headers: rl.headers })
}
