import { NextRequest, NextResponse } from 'next/server'
import { apiMessage } from '@/lib/i18n/apiErrors'
import { getRequestLocale } from '@/lib/i18n/serverLocale'
import { rateLimitAsync } from '@/lib/rateLimit'
import { createClient } from '@/lib/supabase/server'
import { loadSwipeExclusions } from '@/lib/swipeExclusions'

const TYPES = ['anime', 'manga', 'movie', 'tv', 'game', 'boardgame'] as const
type SwipeType = typeof TYPES[number]

const TYPE_SET = new Set<string>(TYPES)

type SwipeDiscoveryItem = {
  id: string
  external_id?: string
  title: string
  title_original?: string
  title_en?: string
  title_it?: string
  type: SwipeType
  coverImage?: string
  cover_image?: string
  description?: string
  description_en?: string
  description_it?: string
  localized?: Record<string, any>
  year?: number
  genres?: string[]
  score?: number
  source?: string
  why?: string
  matchScore?: number
  isDiscovery?: boolean
}

function cleanString(value: unknown, max = 300): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim().slice(0, max)
  return clean || null
}

function normalizeType(value: unknown): SwipeType | null {
  const clean = cleanString(value, 40)
  return clean && TYPE_SET.has(clean) ? clean as SwipeType : null
}

function hasGoodCover(item: any) {
  const cover = cleanString(
    item?.coverImage
      || item?.cover_image
      || item?.localized?.it?.coverImage
      || item?.localized?.it?.cover_image
      || item?.localized?.en?.coverImage
      || item?.localized?.en?.cover_image,
    1000,
  )
  if (!cover) return false
  const lower = cover.toLowerCase()
  return !lower.includes('placeholder') && !lower.includes('no-image') && !lower.includes('n/a')
}

function isLikelyTrash(item: any) {
  const title = cleanString(item?.title || item?.title_en || item?.title_it || item?.title_original, 300)?.toLowerCase() || ''
  if (!title) return true
  const blockedTitleBits = [
    'soundtrack',
    'artbook',
    'demo',
    'dedicated server',
    'sdk',
    'trailer',
    'wallpaper',
    'upgrade',
    'starter pack',
  ]
  if (blockedTitleBits.some(bit => title.includes(bit))) return true

  const score = Number(item?.score)
  if (Number.isFinite(score) && score > 0) {
    const normalized = score > 10 ? score / 20 : score
    if (normalized < 3.1) return true
  }

  return false
}

function normalizeItem(item: any): SwipeDiscoveryItem | null {
  const type = normalizeType(item?.type)
  const title = cleanString(item?.title || item?.title_en || item?.title_it || item?.title_original)
  const rawId = cleanString(item?.id || item?.external_id, 160)
  if (!type || !title || !rawId || !hasGoodCover(item) || isLikelyTrash(item)) return null

  return {
    ...item,
    id: rawId,
    external_id: item?.external_id || rawId,
    title,
    type,
    genres: Array.isArray(item?.genres) ? item.genres.slice(0, 12) : [],
    isDiscovery: true,
    why: item?.why || 'Titolo in evidenza da esplorare',
    matchScore: Math.max(45, Math.min(82, Number(item?.matchScore || item?.match_score || 58))),
  }
}

function interleaveByType(itemsByType: Record<SwipeType, SwipeDiscoveryItem[]>, limit: number) {
  const out: SwipeDiscoveryItem[] = []
  const seen = new Set<string>()

  while (out.length < limit) {
    let added = false
    for (const type of TYPES) {
      const next = itemsByType[type].shift()
      if (!next || seen.has(next.id)) continue
      seen.add(next.id)
      out.push(next)
      added = true
      if (out.length >= limit) break
    }
    if (!added) break
  }

  return out
}

async function fetchTrending(origin: string, section: SwipeType | 'all', locale: string, cookie: string | null) {
  const res = await fetch(`${origin}/api/trending?section=${section}&lang=${locale}`, {
    headers: cookie ? { cookie } : undefined,
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null)
  if (!res?.ok) return section === 'all' ? {} : []
  return res.json().catch(() => section === 'all' ? {} : [])
}

export async function GET(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 60, windowMs: 60_000, prefix: 'swipe:discovery' })
  if (!rl.ok) return NextResponse.json({ error: apiMessage(request, 'tooManyRequests') }, { status: 429, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: apiMessage(request, 'notAuthenticated') }, { status: 401, headers: rl.headers })

  const locale = await getRequestLocale(request, supabase, user.id)
  const requested = request.nextUrl.searchParams.get('type') || 'all'
  const types = requested === 'all'
    ? TYPES
    : TYPES.filter(type => type === requested)
  if (types.length === 0) return NextResponse.json({ recommendations: {}, source: 'swipe_discovery' }, { headers: rl.headers })

  const { ownedIds, ownedTitles, skippedIds } = await loadSwipeExclusions(supabase, user.id)
  const origin = request.nextUrl.origin
  const cookie = request.headers.get('cookie')

  const recommendations: Record<string, SwipeDiscoveryItem[]> = {}

  if (requested === 'all') {
    const payload = await fetchTrending(origin, 'all', locale, cookie)
    const byType: Record<SwipeType, SwipeDiscoveryItem[]> = {
      anime: [],
      manga: [],
      movie: [],
      tv: [],
      game: [],
      boardgame: [],
    }
    for (const type of TYPES) {
      const rawItems = Array.isArray(payload?.[type]) ? payload[type] : []
      byType[type] = rawItems
        .map(normalizeItem)
        .filter((item: SwipeDiscoveryItem | null): item is SwipeDiscoveryItem => Boolean(item))
        .filter(item => !ownedIds.has(item.id) && !skippedIds.has(item.id) && !ownedTitles.has(item.title.toLowerCase()))
        .slice(0, 20)
    }
    const mixed = interleaveByType(byType, 60)
    for (const item of mixed) {
      recommendations[item.type] ||= []
      recommendations[item.type].push(item)
    }
  } else {
    const type = types[0]
    const payload = await fetchTrending(origin, type, locale, cookie)
    recommendations[type] = (Array.isArray(payload) ? payload : [])
      .map(normalizeItem)
      .filter((item: SwipeDiscoveryItem | null): item is SwipeDiscoveryItem => Boolean(item))
      .filter(item => !ownedIds.has(item.id) && !skippedIds.has(item.id) && !ownedTitles.has(item.title.toLowerCase()))
      .slice(0, 60)
  }

  return NextResponse.json({
    recommendations,
    source: 'swipe_discovery',
    cached: false,
  }, { headers: { ...rl.headers, 'Cache-Control': 'no-store' } })
}
